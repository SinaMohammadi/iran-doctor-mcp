// Imported FIRST by every unit test: quiet logs, temp report folder, fast deadlines. Must run before src/config.js loads.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DOCTOR_MCP_LOG_LEVEL ??= "silent";
process.env.DOCTOR_MCP_REPORT_DIR ??= mkdtempSync(join(tmpdir(), "iran-doctor-test-"));
process.env.DOCTOR_MCP_PLATFORM_DEADLINE_MS ??= "1000";
process.env.DOCTOR_MCP_CACHE_TTL ??= "60";
process.env.DOCTOR_MCP_RETRIES ??= "0";
