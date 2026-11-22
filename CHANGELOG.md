# Changelog

## Unreleased

### Changed
- HTML reports are saved by default in `<OS temp>/iran-doctor-mcp/reports/` instead of the package folder, which can be
  read-only for global or `npx` installs. `DOCTOR_MCP_REPORT_DIR` still overrides it.
- Released under the MIT license.

### Fixed
- Timeout errors no longer repeat the platform name («پذیرش۲۴: پذیرش۲۴: no answer within 40s»).
- `get_doctor_details` for Doctoreto refuses URLs of other sites instead of silently treating them as a Doctoreto id.

## 1.1.0 — 2026-11-18

### Added
- **Interactive HTML report** for every search (`reports/doctor-<time>-<name>.html`): summary tiles, best-option cards,
  one card per doctor, filters (text, visit type, free slots only, specialty, site), sorting, tap-to-call phones,
  light/dark mode, mobile layout, print/PDF, stale-data warning. Returned as a `resource_link` by `search_doctor`.
- **CLI** `iran-doctor-report` / `npm run report`: search from the terminal, open the page, `--md` / `--json` output.
- Configuration through environment variables, validated at startup (`src/config.js`).
- Structured JSON logging to stderr with levels (`DOCTOR_MCP_LOG_LEVEL`).
- Per-site deadline (`DOCTOR_MCP_PLATFORM_DEADLINE_MS`): a slow site is reported as failed instead of blocking the answer.
- In-memory cache of identical searches (`DOCTOR_MCP_CACHE_TTL`, default 120 s).
- Automatic cleanup of old HTML reports (`DOCTOR_MCP_REPORT_KEEP`, default 200).
- Offline unit tests (`npm test`, 28 tests) and the live end-to-end test (`npm run test:live`).
- Tool annotations (read-only / open-world hints) and input length limits.

### Changed
- Report rewritten for patients: summary first, one block per doctor, merged "best options", shorter next steps,
  one-line platform status, Persian digits, relative dates («۳ روز دیگر»), no fake "0.0/5" ratings.
- Code split into `server.js` (tools), `search.js` (platform registry + search), `index.js` (stdio entry point).
- HTTP client retries only on network errors, timeouts, 429 and 5xx (with backoff); response size is capped.

### Fixed
- **Wrong doctor grouping**: doctors with the same name and city but different specialties (e.g. a cardiologist and a
  midwife) were shown as one person. Profiles are now merged only when name, city *and* medical field match.
- **Server did not start through the `iran-doctor-mcp` bin** (entry-point detection compared file names).
- **SSRF**: `get_doctor_details` for nobat.ir fetched any URL it was given. All requests are now restricted to the five
  booking sites, including after redirects.
- HTML page hardened: escaped data block, strict Content-Security-Policy pinned to the page script's hash, `no-referrer`.

## 1.0.0
- First version: `search_doctor`, `get_doctor_details`, `list_platforms` over Paziresh24, Doctoreto, Nobat.ir, DrNext, Darmankade.
