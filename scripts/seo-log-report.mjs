#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_PAGE_PREFIX = "/projects/token-balance-monitor/";
const DEFAULT_GITHUB_PATH = "/go/token-balance-monitor-github";

if (isMainModule()) {
  await main();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const input = await readInput(options.file);
  const report = buildReport(input, options);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatReport(report));
  }
}

export function buildReport(text, options = {}) {
  const pagePrefix = options.pagePrefix || DEFAULT_PAGE_PREFIX;
  const githubPath = options.githubPath || DEFAULT_GITHUB_PATH;
  const since = options.since ? new Date(options.since) : null;
  const until = options.until ? new Date(options.until) : null;
  const records = text
    .split(/\r?\n/)
    .map(parseNginxLine)
    .filter(Boolean)
    .filter((record) => inDateRange(record.time, since, until));

  const pageRecords = records.filter((record) => record.path === "/" || record.path.startsWith(pagePrefix));
  const htmlPageviews = pageRecords.filter((record) => {
    return record.status >= 200 && record.status < 400 && isLikelyHTMLPath(record.path);
  });
  const githubClicks = records.filter((record) => record.path === githubPath && record.status >= 300 && record.status < 400);
  const botHits = pageRecords.filter((record) => classifyBot(record.userAgent));
  const humanPageviews = htmlPageviews.filter((record) => !classifyBot(record.userAgent));

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      pagePrefix,
      githubPath,
      since: options.since || null,
      until: options.until || null
    },
    totals: {
      logLines: records.length,
      pageRequests: pageRecords.length,
      htmlPageviews: htmlPageviews.length,
      humanPageviews: humanPageviews.length,
      githubClicks: githubClicks.length,
      botHits: botHits.length,
      uniqueHumanIps: countUnique(humanPageviews.map((record) => record.ip))
    },
    status: countBy(pageRecords, (record) => String(record.status)),
    topPaths: top(countBy(pageRecords, (record) => record.path), 12),
    referrers: top(countBy(humanPageviews, (record) => normalizeReferrer(record.referrer)), 12),
    searchReferrers: top(countBy(humanPageviews, (record) => normalizeSearchReferrer(record.referrer)), 12),
    bots: top(countBy(botHits, (record) => classifyBot(record.userAgent)), 12),
    githubClickReferrers: top(countBy(githubClicks, (record) => normalizeReferrer(record.referrer)), 12)
  };
}

function formatReport(report) {
  const lines = [];
  lines.push("Token Balance Monitor SEO Report");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Page prefix: ${report.filters.pagePrefix}`);
  lines.push("");
  lines.push("Totals");
  lines.push(`- Log lines: ${report.totals.logLines}`);
  lines.push(`- Page requests: ${report.totals.pageRequests}`);
  lines.push(`- HTML pageviews: ${report.totals.htmlPageviews}`);
  lines.push(`- Human pageviews: ${report.totals.humanPageviews}`);
  lines.push(`- Unique human IPs: ${report.totals.uniqueHumanIps}`);
  lines.push(`- GitHub clicks: ${report.totals.githubClicks}`);
  lines.push(`- Bot hits: ${report.totals.botHits}`);
  addTable(lines, "Status", report.status);
  addTable(lines, "Top paths", report.topPaths);
  addTable(lines, "Referrers", report.referrers);
  addTable(lines, "Search referrers", report.searchReferrers);
  addTable(lines, "Bots", report.bots);
  addTable(lines, "GitHub click referrers", report.githubClickReferrers);
  return lines.join("\n");
}

function addTable(lines, title, entries) {
  lines.push("");
  lines.push(title);
  const list = Array.isArray(entries) ? entries : Object.entries(entries || {});
  if (list.length === 0) {
    lines.push("- none");
    return;
  }
  for (const [key, value] of list) {
    lines.push(`- ${key}: ${value}`);
  }
}

function parseNginxLine(line) {
  const match = line.match(/^(\S+) \S+ \S+ \[([^\]]+)] "([^"]*)" (\d{3}) (\d+|-) "([^"]*)" "([^"]*)" "([^"]*)"$/);
  if (!match) return null;
  const [, ip, timeLocal, request, status, bytes, referrer, userAgent, forwardedFor] = match;
  const requestParts = request.split(" ");
  const method = requestParts[0] || "";
  const rawPath = requestParts[1] || "";
  const protocol = requestParts[2] || "";
  const path = safePathname(rawPath);
  return {
    ip,
    time: parseNginxTime(timeLocal),
    method,
    path,
    rawPath,
    protocol,
    status: Number(status),
    bytes: bytes === "-" ? 0 : Number(bytes),
    referrer,
    userAgent,
    forwardedFor
  };
}

function parseNginxTime(value) {
  const match = value.match(/^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})$/);
  if (!match) return null;
  const [, day, monthName, year, hour, minute, second, offset] = match;
  const month = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12"
  }[monthName];
  if (!month) return null;
  const isoOffset = `${offset.slice(0, 3)}:${offset.slice(3)}`;
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${isoOffset}`);
}

function inDateRange(time, since, until) {
  if (!time || Number.isNaN(time.getTime())) return true;
  if (since && time < since) return false;
  if (until && time > until) return false;
  return true;
}

function safePathname(rawPath) {
  if (!rawPath) return "";
  try {
    return new URL(rawPath, "https://ai.meter.panyue.xyz").pathname;
  } catch {
    return rawPath.split("?")[0];
  }
}

function isLikelyHTMLPath(pathname) {
  if (pathname === "/") return true;
  if (pathname.endsWith("/")) return true;
  if (pathname.endsWith(".html")) return true;
  return !/\.[a-z0-9]{2,6}$/i.test(pathname);
}

function classifyBot(userAgent) {
  const value = userAgent.toLowerCase();
  if (value.includes("googlebot")) return "Googlebot";
  if (value.includes("bingbot")) return "Bingbot";
  if (value.includes("baiduspider")) return "Baiduspider";
  if (value.includes("bytespider")) return "ByteSpider";
  if (value.includes("yandexbot")) return "YandexBot";
  if (value.includes("duckduckbot")) return "DuckDuckBot";
  if (value.includes("applebot")) return "Applebot";
  if (value.includes("semrushbot")) return "SemrushBot";
  if (value.includes("ahrefsbot")) return "AhrefsBot";
  if (value.includes("bot") || value.includes("spider") || value.includes("crawler")) return "Other bot";
  return "";
}

function normalizeReferrer(referrer) {
  if (!referrer || referrer === "-") return "(direct)";
  try {
    const url = new URL(referrer);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "(invalid)";
  }
}

function normalizeSearchReferrer(referrer) {
  const host = normalizeReferrer(referrer);
  if (host === "(direct)" || host === "(invalid)") return "";
  if (host.includes("google.")) return "Google";
  if (host.includes("bing.")) return "Bing";
  if (host.includes("baidu.")) return "Baidu";
  if (host.includes("sogou.")) return "Sogou";
  if (host.includes("so.com")) return "360 Search";
  if (host.includes("duckduckgo.")) return "DuckDuckGo";
  if (host.includes("yandex.")) return "Yandex";
  return "";
}

function countBy(records, keyFn) {
  const counts = new Map();
  for (const record of records) {
    const key = keyFn(record);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function top(counts, limit) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

function countUnique(values) {
  return new Set(values.filter(Boolean)).size;
}

function parseArgs(args) {
  const options = {
    pagePrefix: DEFAULT_PAGE_PREFIX,
    githubPath: DEFAULT_GITHUB_PATH,
    file: "",
    json: false,
    since: "",
    until: ""
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--file") {
      options.file = args[++i] || "";
    } else if (arg === "--page-prefix") {
      options.pagePrefix = args[++i] || options.pagePrefix;
    } else if (arg === "--github-path") {
      options.githubPath = args[++i] || options.githubPath;
    } else if (arg === "--since") {
      options.since = args[++i] || "";
    } else if (arg === "--until") {
      options.until = args[++i] || "";
    } else if (!arg.startsWith("--") && !options.file) {
      options.file = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

async function readInput(file) {
  if (file) return fs.readFileSync(file, "utf8");
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function isMainModule() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}
