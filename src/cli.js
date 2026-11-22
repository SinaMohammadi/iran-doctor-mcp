#!/usr/bin/env node
// Search a doctor from the terminal and open the interactive HTML report.
import { parseArgs } from "node:util";
import { searchAll, IDS } from "./search.js";
import { buildModel, buildReport, toJSON } from "./report.js";
import { saveHtml, openFile } from "./html.js";
import { setLogLevel } from "./log.js";

if (!process.env.DOCTOR_MCP_LOG_LEVEL) setLogLevel("warn");

const HELP = `iran-doctor-report — search Iranian booking sites for a doctor and open an interactive HTML report

Usage:
  iran-doctor-report "<doctor name>" [city] [options]
  npm run report -- "<doctor name>" [city] [options]

Options:
  --max <n>          doctors to open per site (1-10, default 5)
  --platforms <ids>  comma-separated subset: ${IDS.join(",")}
  --sort <s>         soonest | cheapest | rating (Markdown output only; the page has its own sort)
  --md               also print the Persian Markdown report to stdout
  --json             print the raw results as JSON to stdout (no HTML unless --html)
  --html             save HTML even with --json
  --no-open          save the HTML but don't open the browser
  -h, --help         show this help

Examples:
  iran-doctor-report "مریم احمدی" تهران
  iran-doctor-report احمدی شیراز --platforms paziresh24,doctoreto --no-open
`;

let opts;
try {
  opts = parseArgs({
    allowPositionals: true,
    options: {
      max: { type: "string" },
      platforms: { type: "string" },
      sort: { type: "string" },
      md: { type: "boolean" },
      json: { type: "boolean" },
      html: { type: "boolean" },
      "no-open": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
} catch (e) {
  console.error(`${e.message}\n\n${HELP}`);
  process.exit(2);
}
const { values: v, positionals } = opts;
const [name, city] = positionals;
if (v.help) {
  console.log(HELP);
  process.exit(0);
}
if (!name || name.trim().length < 2) {
  console.error(HELP);
  process.exit(2);
}

const limit = v.max ? Number(v.max) : 5;
if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
  console.error("--max must be an integer between 1 and 10");
  process.exit(2);
}
const platforms = v.platforms ? v.platforms.split(",").map((s) => s.trim()).filter(Boolean) : IDS;
const unknown = platforms.filter((p) => !IDS.includes(p));
if (unknown.length || !platforms.length) {
  console.error(`Unknown platform(s): ${unknown.join(", ") || "(none given)"}. Valid: ${IDS.join(", ")}`);
  process.exit(2);
}
const sort = v.sort || "soonest";
if (!["soonest", "cheapest", "rating"].includes(sort)) {
  console.error("--sort must be soonest, cheapest or rating");
  process.exit(2);
}

const t = Date.now();
console.error(`در حال جستجوی «${name}»${city ? ` در ${city}` : ""} در ${platforms.length} سایت نوبت‌دهی…`);
const { doctors, platformStatus } = await searchAll(name, { city, platforms, limit });
for (const p of platformStatus) console.error(`${p.ok ? "✓" : "✗"} ${p.name}: ${p.ok ? `${p.count} پزشک` : p.error}`);
console.error(`(${((Date.now() - t) / 1000).toFixed(1)}s)`);

if (v.json) console.log(JSON.stringify({ query: name, city: city || null, platformStatus, doctors: toJSON(doctors) }, null, 2));
if (v.md) console.log(buildReport({ query: name, city, doctors, platformStatus, sort }));
if (!v.json || v.html) {
  const file = saveHtml(buildModel({ query: name, city, doctors, platformStatus }));
  console.error(`📄 ${file}`);
  if (!v.md && !v.json) console.log(file);
  if (!v["no-open"]) openFile(file);
}
process.exit(platformStatus.every((p) => !p.ok) ? 1 : 0);
