#!/usr/bin/env node
// Iran Doctor MCP — stdio entry point.
// Search a doctor by name across Iranian booking platforms: first free appointment, price, booking links.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, VERSION } from "./server.js";
import { config } from "./config.js";
import { log } from "./log.js";

const server = createServer();
let closing = false;

async function shutdown(reason, code = 0) {
  if (closing) return;
  closing = true;
  log.info("shutting down", { reason });
  try {
    await server.close();
  } catch {
    /* already closed */
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.stdin.on("close", () => shutdown("stdin closed"));
process.on("unhandledRejection", (e) => log.error("unhandled rejection", { error: e?.stack || String(e) }));
process.on("uncaughtException", (e) => {
  log.error("uncaught exception", { error: e?.stack || String(e) });
  shutdown("uncaught exception", 1);
});

await server.connect(new StdioServerTransport());
log.info("iran-doctor MCP server ready", { version: VERSION, node: process.version, reportDir: config.htmlDefault ? config.reportDir : null });
