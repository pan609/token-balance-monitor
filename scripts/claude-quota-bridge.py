#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import getpass
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

import keyring
from curl_cffi import requests


BASE_URL = "https://claude.ai/api"
DEFAULT_KEYRING_SERVICE = "token-balance-monitor-claude"
DEFAULT_KEYRING_KEY = "cookie"
LEGACY_KEYRING_SERVICE = "claude-usage-pet"


class BridgeError(Exception):
    pass


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch Claude usage and emit an AI Quota snapshot.")
    parser.add_argument("--set-cookie", action="store_true", help="Store Claude cookie in macOS Keychain.")
    parser.add_argument("--json", action="store_true", help="Print snapshot JSON.")
    parser.add_argument("--raw", action="store_true", help="Print raw Claude usage response.")
    parser.add_argument("--post", action="store_true", help="Post snapshot to QUOTA_INGEST_URL/TOKEN_MONITOR_QUOTA_URL.")
    args = parser.parse_args()

    try:
        if args.set_cookie:
            set_cookie_interactive()
            return

        raw = fetch_usage()
        if args.raw:
            print(json.dumps(raw, ensure_ascii=False, indent=2))
            return

        snapshot = build_snapshot(raw)
        if args.post:
            post_snapshot(snapshot)

        if args.json:
            print(json.dumps(snapshot, ensure_ascii=False, indent=2))
        else:
            window = snapshot["windows"][0]
            print(f"Claude {window['label']} {round(window['remainingPercent'])}% 剩余")
    except Exception as error:
        if args.json or args.raw:
            print(json.dumps({"ok": False, "message": str(error)}, ensure_ascii=False))
        else:
            print(f"Claude 额度读取失败：{error}")
        raise SystemExit(1)


def fetch_usage() -> dict[str, Any]:
    org_uuid = resolve_org_uuid()
    cookie = get_cookie()
    if not cookie:
        raise BridgeError("Claude Cookie 未配置，请先运行 node scripts/claude-quota-bridge.mjs --set-cookie")

    response = requests.get(
        f"{BASE_URL}/organizations/{org_uuid}/usage",
        headers={
            "Cookie": cookie,
            "Accept": "application/json",
            "Referer": "https://claude.ai/settings/usage",
        },
        timeout=float(os.environ.get("CLAUDE_QUOTA_TIMEOUT_SECONDS", "25")),
        impersonate=os.environ.get("CLAUDE_QUOTA_IMPERSONATE", "chrome"),
    )
    if response.status_code in (401, 403):
        raise BridgeError("Claude Cookie 已过期或被拦截，请重新配置 Cookie")
    response.raise_for_status()
    return response.json()


def build_snapshot(raw: dict[str, Any]) -> dict[str, Any]:
    spend = raw.get("spend")
    if not isinstance(spend, dict):
        raise BridgeError("Claude usage 响应缺少 spend 字段")

    used_money = parse_money(spend.get("used"))
    limit_money = parse_money(spend.get("limit"))
    if used_money is None or limit_money is None or limit_money <= 0:
        raise BridgeError("Claude spend 金额格式无法识别")

    percent = to_number(spend.get("percent"))
    if percent is None:
        percent = used_money / limit_money * 100
    percent = clamp(percent, 0, 100)
    remaining = clamp(100 - percent, 0, 100)
    currency = str((spend.get("used") or {}).get("currency") or "USD").upper()
    severity = str(spend.get("severity") or "normal")

    return {
        "serviceId": "claude",
        "serviceName": "Claude",
        "accountLabel": os.environ.get("CLAUDE_QUOTA_ACCOUNT_LABEL") or "Claude",
        "planLabel": os.environ.get("CLAUDE_QUOTA_PLAN_LABEL") or "claude.ai usage",
        "source": "claude-usage-cookie",
        "fetchedAt": now_iso(),
        "windows": [
            {
                "id": "monthly",
                "label": "本月",
                "usedPercent": round(percent, 2),
                "remainingPercent": round(remaining, 2),
                "resetsAt": next_month_reset_iso(),
                "usedText": f"{format_money(used_money, currency)} 已用",
                "remainingText": f"{format_money(max(limit_money - used_money, 0), currency)} 剩余",
                "limitText": f"{format_money(limit_money, currency)} 上限",
            }
        ],
        "message": f"severity={severity}",
        "metadata": {
            "bridge": "claude-quota-bridge",
            "currency": currency,
            "severity": severity,
            "rawPercent": spend.get("percent"),
        },
    }


def get_cookie() -> str | None:
    service = os.environ.get("CLAUDE_KEYRING_SERVICE", DEFAULT_KEYRING_SERVICE)
    key = os.environ.get("CLAUDE_KEYRING_KEY", DEFAULT_KEYRING_KEY)
    cookie = keyring.get_password(service, key)
    if cookie or os.environ.get("CLAUDE_KEYRING_SERVICE"):
        return cookie

    # Migration convenience for users of the original standalone menu bar helper.
    return keyring.get_password(LEGACY_KEYRING_SERVICE, key)


def set_cookie_interactive() -> None:
    service = os.environ.get("CLAUDE_KEYRING_SERVICE", DEFAULT_KEYRING_SERVICE)
    key = os.environ.get("CLAUDE_KEYRING_KEY", DEFAULT_KEYRING_KEY)
    print(
        "\nPaste the full Cookie header value from a claude.ai usage request.\n"
        "It will be stored in macOS Keychain and will not be written to this repo.\n"
    )
    cookie = getpass.getpass("Cookie: ").strip()
    if not cookie:
        raise BridgeError("empty cookie")
    keyring.set_password(service, key, cookie)
    print(f"Saved Claude cookie to Keychain service={service!r}, key={key!r}.")


def resolve_org_uuid() -> str:
    for key in ("CLAUDE_ORG_UUID", "CLAUDE_USAGE_ORG_UUID"):
        value = os.environ.get(key, "").strip()
        if value:
            return value

    legacy_file = Path.home() / "claude-usage-pet" / "claude_pet.py"
    if legacy_file.exists():
        match = re.search(r'ORG_UUID\s*=\s*["\']([^"\']+)["\']', legacy_file.read_text(encoding="utf-8"))
        if match:
            return match.group(1)

    raise BridgeError("缺少 CLAUDE_ORG_UUID，请从 claude.ai usage 请求 URL 中配置组织 ID")


def post_snapshot(snapshot: dict[str, Any]) -> None:
    url = (
        os.environ.get("TOKEN_MONITOR_QUOTA_URL")
        or os.environ.get("QUOTA_INGEST_URL")
        or os.environ.get("TOKEN_MONITOR_INGEST_URL")
        or ""
    )
    if not url:
        raise BridgeError("缺少 QUOTA_INGEST_URL，无法上报 snapshot")

    token = (
        os.environ.get("TOKEN_MONITOR_QUOTA_TOKEN")
        or os.environ.get("QUOTA_INGEST_TOKEN")
        or os.environ.get("TOKEN_MONITOR_INGEST_TOKEN")
        or ""
    )
    body = json.dumps(snapshot).encode("utf-8")
    request = Request(url, data=body, method="POST", headers={"content-type": "application/json"})
    if token:
        request.add_header("authorization", f"Bearer {token}")
    with urlopen(request, timeout=15) as response:
        if response.status >= 400:
            raise BridgeError(f"quota ingest failed: HTTP {response.status}")


def parse_money(value: Any) -> float | None:
    if not isinstance(value, dict):
        return None
    amount_minor = to_number(value.get("amount_minor"))
    exponent = to_number(value.get("exponent"))
    if amount_minor is None or exponent is None:
        return None
    return amount_minor / (10 ** exponent)


def to_number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number:
        return None
    return number


def format_money(value: float, currency: str) -> str:
    symbol = "$" if currency == "USD" else f"{currency} "
    return f"{symbol}{value:.2f}"


def next_month_reset_iso() -> str:
    now = dt.datetime.now(dt.timezone.utc)
    year = now.year + 1 if now.month == 12 else now.year
    month = 1 if now.month == 12 else now.month + 1
    reset = dt.datetime(year, month, 1, tzinfo=dt.timezone.utc)
    return reset.isoformat().replace("+00:00", "Z")


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


if __name__ == "__main__":
    main()
