#!/usr/bin/env node

const DEFAULT_PATH = "/projects/token-balance-monitor/";
const DEFAULT_CONVERSIONS = ["/go/token-balance-monitor-github"];

const MONTHS = {
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
  Dec: "12",
};

const BOT_PATTERNS = [
  ["Googlebot", /googlebot|google-inspectiontool/i],
  ["Bingbot", /bingbot/i],
  ["Baiduspider", /baiduspider/i],
  ["Bytespider", /bytespider/i],
  ["Sogou", /sogou/i],
  ["360Spider", /360spider|haosouspider/i],
  ["DuckDuckBot", /duckduckbot/i],
  ["YandexBot", /yandexbot/i],
  ["Applebot", /applebot/i],
  ["Social preview", /facebookexternalhit|twitterbot|slackbot|discordbot|larkurlpreview|telegrambot|micromessenger/i],
];

const SEARCH_REFERRERS = [
  ["Google", /(^|\.)google\./i],
  ["Bing", /(^|\.)bing\.com/i],
  ["Baidu", /(^|\.)baidu\.com/i],
  ["Sogou", /(^|\.)sogou\.com/i],
  ["360 Search", /(^|\.)so\.com/i],
  ["DuckDuckGo", /duckduckgo\.com/i],
  ["Yandex", /yandex\./i],
];

function parseArgs(argv) {
  const args = {
    path: DEFAULT_PATH,
    conversions: [...DEFAULT_CONVERSIONS],
    json: false,
    since: null,
    until: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      args.json = true;
    } else if (arg === "--path") {
      args.path = ensureTrailingSlash(argv[++index] || DEFAULT_PATH);
    } else if (arg === "--conversion") {
      args.conversions.push(argv[++index]);
    } else if (arg === "--since") {
      args.since = parseCliDate(argv[++index]);
    } else if (arg === "--until") {
      args.until = parseCliDate(argv[++index]);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function ensureTrailingSlash(value) {
  if (!value) return DEFAULT_PATH;
  return value.endsWith("/") ? value : `${value}/`;
}

function parseCliDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date;
}

function parseNginxDate(value) {
  const match = value.match(/^(\d{1,2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/);
  if (!match) return null;
  const [, day, monthName, year, time, offsetHour, offsetMinute] = match;
  const month = MONTHS[monthName];
  if (!month) return null;
  return new Date(`${year}-${month}-${day.padStart(2, "0")}T${time}${offsetHour}:${offsetMinute}`);
}

function parseLine(line) {
  const match = line.match(/^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]*)" (\d{3}) (\S+) "([^"]*)" "([^"]*)"/);
  if (!match) return null;

  const [, ip, rawDate, request, status, bytes, referrer, userAgent] = match;
  const [method, target] = request.split(" ");
  const date = parseNginxDate(rawDate);
  if (!date || !method || !target) return null;

  let pathname = target;
  try {
    pathname = new URL(target, "https://panyue.xyz").pathname;
  } catch {
    pathname = target.split("?")[0];
  }

  return {
    ip,
    date,
    method,
    path: pathname,
    status,
    bytes: bytes === "-" ? 0 : Number(bytes),
    referrer,
    userAgent,
  };
}

function isRelevant(entry, args) {
  return (
    entry.path === args.path.slice(0, -1) ||
    entry.path.startsWith(args.path) ||
    entry.path === "/sitemap.xml" ||
    entry.path === "/robots.txt" ||
    args.conversions.includes(entry.path)
  );
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function topEntries(map, limit = 10) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

function classifyBot(userAgent) {
  for (const [name, pattern] of BOT_PATTERNS) {
    if (pattern.test(userAgent)) return name;
  }
  return null;
}

function classifySearchReferrer(referrer) {
  if (!referrer || referrer === "-") return null;
  let host = referrer;
  try {
    host = new URL(referrer).hostname;
  } catch {
    return null;
  }
  for (const [name, pattern] of SEARCH_REFERRERS) {
    if (pattern.test(host)) return name;
  }
  return null;
}

function createReport(entries, args) {
  const report = {
    path: args.path,
    conversions: Object.fromEntries(args.conversions.map((path) => [path, 0])),
    dateRange: {
      first: null,
      last: null,
    },
    totalRequests: 0,
    pageViews: 0,
    uniqueIpCount: 0,
    sitemapHits: 0,
    robotsHits: 0,
    assetErrors: 0,
    statusCodes: {},
    topPaths: [],
    topReferrers: [],
    searchReferrers: [],
    bots: [],
  };

  const uniqueIps = new Set();
  const statusCodes = new Map();
  const paths = new Map();
  const referrers = new Map();
  const searchReferrers = new Map();
  const bots = new Map();

  for (const entry of entries) {
    if (args.since && entry.date < args.since) continue;
    if (args.until && entry.date > args.until) continue;
    if (!isRelevant(entry, args)) continue;

    report.totalRequests += 1;
    uniqueIps.add(entry.ip);

    if (!report.dateRange.first || entry.date < report.dateRange.first) {
      report.dateRange.first = entry.date;
    }
    if (!report.dateRange.last || entry.date > report.dateRange.last) {
      report.dateRange.last = entry.date;
    }

    increment(statusCodes, entry.status);
    increment(paths, entry.path);

    if (entry.referrer && entry.referrer !== "-") {
      increment(referrers, entry.referrer);
      const searchEngine = classifySearchReferrer(entry.referrer);
      if (searchEngine) increment(searchReferrers, searchEngine);
    }

    const bot = classifyBot(entry.userAgent);
    if (bot) increment(bots, bot);

    if (entry.method === "GET" && (entry.path === args.path || entry.path === `${args.path}index.html`)) {
      report.pageViews += 1;
    }

    if (entry.path === "/sitemap.xml") report.sitemapHits += 1;
    if (entry.path === "/robots.txt") report.robotsHits += 1;
    if (args.conversions.includes(entry.path)) report.conversions[entry.path] += 1;
    if (entry.path.startsWith(`${args.path}assets/`) && Number(entry.status) >= 400) {
      report.assetErrors += 1;
    }
  }

  report.uniqueIpCount = uniqueIps.size;
  report.statusCodes = Object.fromEntries(topEntries(statusCodes, 20));
  report.topPaths = topEntries(paths, 12);
  report.topReferrers = topEntries(referrers, 10);
  report.searchReferrers = topEntries(searchReferrers, 10);
  report.bots = topEntries(bots, 10);

  return report;
}

function formatDate(value) {
  return value ? value.toISOString() : "-";
}

function renderMarkdown(report) {
  const lines = [];
  lines.push(`# SEO Log Report`);
  lines.push("");
  lines.push(`- Path: \`${report.path}\``);
  lines.push(`- Window: ${formatDate(report.dateRange.first)} to ${formatDate(report.dateRange.last)}`);
  lines.push(`- Total relevant requests: ${report.totalRequests}`);
  lines.push(`- Landing page views: ${report.pageViews}`);
  lines.push(`- Unique IPs: ${report.uniqueIpCount}`);
  lines.push(`- Sitemap hits: ${report.sitemapHits}`);
  lines.push(`- Robots hits: ${report.robotsHits}`);
  lines.push(`- Asset errors: ${report.assetErrors}`);
  lines.push("");
  lines.push(`## Conversions`);
  for (const [path, count] of Object.entries(report.conversions)) {
    lines.push(`- \`${path}\`: ${count}`);
  }
  lines.push("");
  lines.push(`## Status Codes`);
  appendTable(lines, ["Status", "Requests"], Object.entries(report.statusCodes));
  lines.push("");
  lines.push(`## Search Referrers`);
  appendTable(lines, ["Source", "Requests"], report.searchReferrers);
  lines.push("");
  lines.push(`## Bot Hits`);
  appendTable(lines, ["Bot", "Requests"], report.bots);
  lines.push("");
  lines.push(`## Top Paths`);
  appendTable(lines, ["Path", "Requests"], report.topPaths);
  lines.push("");
  lines.push(`## Top Referrers`);
  appendTable(lines, ["Referrer", "Requests"], report.topReferrers);
  return lines.join("\n");
}

function appendTable(lines, headers, rows) {
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
  if (!rows.length) {
    lines.push(`| - | 0 |`);
    return;
  }
  for (const [key, value] of rows) {
    lines.push(`| ${String(key).replaceAll("|", "\\|")} | ${value} |`);
  }
}

function printHelp() {
  console.log(`Usage:
  zcat -f /var/log/nginx/access.log* | node scripts/seo-log-report.mjs [options]

Options:
  --path <path>          Landing path prefix. Default: ${DEFAULT_PATH}
  --conversion <path>    Extra conversion path to count. Can be repeated.
  --since <date>         Include logs after this date, e.g. 2026-06-16.
  --until <date>         Include logs before this date.
  --json                 Print JSON instead of Markdown.
`);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const args = parseArgs(process.argv.slice(2));
const input = await readStdin();
const entries = input
  .split(/\r?\n/)
  .filter(Boolean)
  .map(parseLine)
  .filter(Boolean);
const report = createReport(entries, args);

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(renderMarkdown(report));
}
