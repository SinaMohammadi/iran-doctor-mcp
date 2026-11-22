// Interactive HTML version of the report: one self-contained file (data embedded as JSON, no build step).
import { readFileSync, mkdirSync, writeFileSync, renameSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { config } from "./config.js";
import { log } from "./log.js";

const TEMPLATE_PATH = fileURLToPath(new URL("./report-template.html", import.meta.url));
let template; // read once, lazily

const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// U+2028/U+2029 (built from char codes so editors and tools can't mangle them)
const LS = new RegExp(String.fromCharCode(0x2028), "g");
const PS = new RegExp(String.fromCharCode(0x2029), "g");

/** JSON that is safe inside <script type="application/json">: no "</script>", no "<!--", no JS line separators. */
export function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(LS, "\\u2028")
    .replace(PS, "\\u2029");
}

function loadTemplate() {
  if (template) return template;
  const raw = readFileSync(TEMPLATE_PATH, "utf8");
  // Content-Security-Policy: only our own inline script (pinned by hash) may run; the page can't load or send anything
  // except the web font. Booking links still open normally (navigation is not restricted).
  const scripts = [...raw.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (scripts.length !== 1) throw new Error(`report template must contain exactly one inline <script> (found ${scripts.length})`);
  const hash = createHash("sha256").update(scripts[0], "utf8").digest("base64");
  const csp = [
    "default-src 'none'",
    `script-src 'sha256-${hash}'`,
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src data:",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  template = raw.replace("__CSP__", () => csp);
  return template;
}

/** Model (from buildModel) -> full HTML document string. */
export function renderHtml(model) {
  const title = `پزشک: ${model.query}${model.city ? ` · ${model.city}` : ""}`;
  return loadTemplate()
    .replace("__TITLE__", () => escHtml(title))
    .replace("__REPORT_DATA__", () => safeJson(model));
}

/** Delete the oldest reports so at most `keep` remain. Only touches files this module created. */
export function pruneReports(dir = config.reportDir, keep = config.reportKeep) {
  if (!keep) return 0;
  let files;
  try {
    files = readdirSync(dir)
      .filter((f) => /^doctor-\d{8}-\d{4}(?:\d{2})?-.*\.html$/.test(f))
      .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const { f } of files.slice(keep)) {
    try {
      unlinkSync(join(dir, f));
      removed++;
    } catch (e) {
      log.warn("could not delete old report", { file: f, error: e.message });
    }
  }
  return removed;
}

/** Write the HTML report (atomically) and return its absolute path. */
export function saveHtml(model, dir = config.reportDir) {
  mkdirSync(dir, { recursive: true });
  const d = new Date(Date.now() + 210 * 60000); // Tehran time (UTC+03:30) for the file name
  const stamp = d.toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  const slug = [model.query, model.city].filter(Boolean).join("-").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "report";
  const file = join(dir, `doctor-${stamp}-${slug}.html`);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, renderHtml(model));
  renameSync(tmp, file);
  const removed = pruneReports(dir);
  log.info("html report saved", { dir, pruned: removed });
  return file;
}

/** Open a file in the default browser (best effort, never throws). */
export function openFile(file) {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [file]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", file]] : ["xdg-open", [file]];
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore" }).on("error", () => {}).unref();
    return true;
  } catch {
    return false;
  }
}
