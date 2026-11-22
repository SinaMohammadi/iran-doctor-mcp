// Minimal structured logger. Writes to STDERR only: stdout belongs to the MCP stdio protocol.
import { config } from "./config.js";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
let threshold = LEVELS[config.logLevel] ?? LEVELS.info;

/** Change the level at runtime (the CLI defaults to "warn" so its output stays readable). */
export function setLogLevel(level) {
  if (!(level in LEVELS)) throw new Error(`unknown log level: ${level}`);
  threshold = LEVELS[level];
}

function write(level, msg, fields) {
  if (LEVELS[level] < threshold) return;
  const line = { t: new Date().toISOString(), level, msg, ...fields };
  try {
    process.stderr.write(JSON.stringify(line) + "\n");
  } catch {
    /* stderr closed: nothing useful to do */
  }
}

export const log = {
  debug: (msg, fields) => write("debug", msg, fields),
  info: (msg, fields) => write("info", msg, fields),
  warn: (msg, fields) => write("warn", msg, fields),
  error: (msg, fields) => write("error", msg, fields),
};
