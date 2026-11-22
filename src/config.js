// Runtime configuration from environment variables (validated once at startup).
import { tmpdir } from "node:os";
import { join } from "node:path";

function int(name, def, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  if (raw == null || raw === "") return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`Invalid ${name}="${raw}": expected an integer between ${min} and ${max}`);
  }
  return n;
}

function bool(name, def) {
  const raw = process.env[name];
  if (raw == null || raw === "") return def;
  if (/^(1|true|yes|on)$/i.test(raw)) return true;
  if (/^(0|false|no|off)$/i.test(raw)) return false;
  throw new Error(`Invalid ${name}="${raw}": expected true/false`);
}

function oneOf(name, def, values) {
  const raw = (process.env[name] || "").toLowerCase();
  if (!raw) return def;
  if (!values.includes(raw)) throw new Error(`Invalid ${name}="${raw}": expected one of ${values.join(", ")}`);
  return raw;
}

function load() {
  return Object.freeze({
  /** Timeout of one HTTP request (ms). */
  requestTimeoutMs: int("DOCTOR_MCP_TIMEOUT_MS", 20000, { min: 1000, max: 120000 }),
  /** Retries per HTTP request on network errors, 429 and 5xx. */
  retries: int("DOCTOR_MCP_RETRIES", 2, { min: 0, max: 5 }),
  /** Hard deadline for one platform's whole search (ms); a slow site is reported as failed instead of blocking the answer. */
  platformDeadlineMs: int("DOCTOR_MCP_PLATFORM_DEADLINE_MS", 45000, { min: 1000, max: 300000 }),
  /** Max response body size (bytes). */
  maxResponseBytes: int("DOCTOR_MCP_MAX_RESPONSE_BYTES", 8 * 1024 * 1024, { min: 64 * 1024, max: 64 * 1024 * 1024 }),
  /** Cache identical searches for this long (seconds). 0 disables the cache. */
  cacheTtlSec: int("DOCTOR_MCP_CACHE_TTL", 120, { min: 0, max: 3600 }),
  /** Save an interactive HTML page for every search_doctor call (tool argument `html` overrides it). */
  htmlDefault: bool("DOCTOR_MCP_HTML", true),
  /** Folder for HTML reports. Defaults to the OS temp folder: always writable, even when installed globally or run via npx. */
  reportDir: process.env.DOCTOR_MCP_REPORT_DIR || join(tmpdir(), "iran-doctor-mcp", "reports"),
  /** Keep at most this many HTML reports (oldest are deleted). 0 keeps everything. */
  reportKeep: int("DOCTOR_MCP_REPORT_KEEP", 200, { min: 0, max: 100000 }),
  /** stderr log level. */
  logLevel: oneOf("DOCTOR_MCP_LOG_LEVEL", "info", ["debug", "info", "warn", "error", "silent"]),
  });
}

let loaded;
try {
  loaded = load();
} catch (e) {
  // A clear one-line message instead of a stack trace; exit code 78 = EX_CONFIG.
  process.stderr.write(`iran-doctor: configuration error: ${e.message}\n`);
  process.exit(78);
}
export const config = loaded;
