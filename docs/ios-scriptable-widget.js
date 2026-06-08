// Scriptable 小组件模板：复制到 iPhone 的 Scriptable App 中。
// 先把 API_URL 改成你的服务器地址，并填入 .env 里的 MOBILE_API_TOKEN。
// 示例：https://balance.example.com/api/mobile/summary?token=你的token

const API_URL = "https://balance.example.com/api/mobile/summary?token=你的MOBILE_API_TOKEN";

const data = await loadSummary();
const widget = new ListWidget();
widget.backgroundColor = new Color(data.primaryIsBelowAlert ? "#fff7ed" : "#f8fafc");
widget.setPadding(14, 14, 14, 14);

const primary = data.providers?.[data.primaryProvider];
const title = widget.addText(`${primary?.shortName || "重点关注"}余额`);
title.font = Font.semiboldSystemFont(13);
title.textColor = new Color("#475569");

widget.addSpacer(8);

const amount = widget.addText(formatMoney(data.primaryAmount, data.primaryCurrency));
amount.font = Font.boldSystemFont(30);
amount.textColor = new Color(data.primaryIsBelowAlert ? "#ea580c" : "#111827");
amount.minimumScaleFactor = 0.75;

widget.addSpacer(8);

const status = widget.addText(
  data.primaryIsBelowAlert
    ? `低于 ${formatMoney(data.alertThresholdCny, "CNY")}，请充值`
    : "余额正常"
);
status.font = Font.mediumSystemFont(12);
status.textColor = new Color(data.primaryIsBelowAlert ? "#c2410c" : "#16a34a");

widget.addSpacer();

const footer = widget.addText(`总余额 ${formatMoney(data.totalCny, "CNY")} · ${formatTime(data.refreshedAt)}`);
footer.font = Font.systemFont(10);
footer.textColor = new Color("#64748b");
footer.minimumScaleFactor = 0.7;

Script.setWidget(widget);
Script.complete();

async function loadSummary() {
  const request = new Request(API_URL);
  request.timeoutInterval = 10;
  return request.loadJSON();
}

function formatMoney(value, currency = "CNY") {
  if (typeof value !== "number") return "--";
  if (currency === "USD") return `$${value.toFixed(2)}`;
  if (currency === "CNY") return `¥${value.toFixed(2)}`;
  return `${value.toFixed(2)} ${currency || ""}`.trim();
}

function formatTime(value) {
  if (!value) return "--:--";
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
