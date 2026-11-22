import "../helpers/env.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, readdirSync, utimesSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderHtml, saveHtml, pruneReports, safeJson } from "../../src/html.js";
import { buildModel } from "../../src/report.js";
import { doctors, okStatus } from "../helpers/fixtures.js";

const evil = "</script><img src=x onerror=alert(1)><!--";
const model = () => {
  const ds = doctors();
  ds[0].name = `دکتر ${evil}`;
  ds[0].services[0].center = evil;
  return buildModel({ query: evil, city: "تهران", doctors: ds, platformStatus: okStatus() });
};

const dataBlock = (html) => html.match(/<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/)[1];

test("embedded data can't break out of its <script> block and round-trips exactly", () => {
  const m = model();
  const html = renderHtml(m);
  assert.equal(html.split("</script>").length - 1, 2, "only the two real closing tags");
  assert.doesNotMatch(html, /<img src=x/);
  assert.deepEqual(JSON.parse(dataBlock(html)), JSON.parse(JSON.stringify(m)));
  assert.ok(!safeJson({ s: "a b" }).includes(" "));
});

test("title is escaped and placeholders are all filled", () => {
  const html = renderHtml(model());
  const title = html.match(/<title>([\s\S]*?)<\/title>/)[1];
  assert.doesNotMatch(title, /</);
  assert.doesNotMatch(html, /__TITLE__|__REPORT_DATA__|__CSP__/);
});

test("CSP pins the inline script by hash", () => {
  const html = renderHtml(model());
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const hash = createHash("sha256").update(script, "utf8").digest("base64");
  assert.ok(csp.includes(`script-src 'sha256-${hash}'`), csp);
  assert.ok(csp.includes("default-src 'none'"));
  assert.doesNotMatch(csp, /unsafe-eval|script-src[^;]*unsafe-inline/);
});

test("saveHtml writes a complete file into the report folder", () => {
  const file = saveHtml(model());
  assert.ok(file.startsWith(process.env.DOCTOR_MCP_REPORT_DIR));
  assert.match(file, /doctor-\d{8}-\d{6}-.+\.html$/);
  const html = readFileSync(file, "utf8");
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(!readdirSync(process.env.DOCTOR_MCP_REPORT_DIR).some((f) => f.endsWith(".tmp")), "no temp files left");
});

test("pruneReports keeps the newest N reports and ignores other files", () => {
  const dir = mkdtempSync(join(tmpdir(), "iran-doctor-prune-"));
  for (let i = 0; i < 5; i++) {
    const f = join(dir, `doctor-20260101-00000${i}-x.html`);
    writeFileSync(f, "x");
    utimesSync(f, new Date(1e12 + i * 1000), new Date(1e12 + i * 1000));
  }
  writeFileSync(join(dir, "notes.txt"), "keep me");
  assert.equal(pruneReports(dir, 2), 3);
  assert.deepEqual(readdirSync(dir).sort(), ["doctor-20260101-000003-x.html", "doctor-20260101-000004-x.html", "notes.txt"]);
  assert.equal(pruneReports(dir, 0), 0, "0 = keep everything");
});
