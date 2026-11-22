// Platform registry + parallel search across all booking sites (deadline per site, short in-memory cache).
import * as paziresh24 from "./providers/paziresh24.js";
import * as doctoreto from "./providers/doctoreto.js";
import * as nobat from "./providers/nobat.js";
import * as drnext from "./providers/drnext.js";
import * as darmankade from "./providers/darmankade.js";
import { config } from "./config.js";
import { log } from "./log.js";
import { normalizeFa } from "./util.js";

/** Provider contract: { info: {id, name, site, app, notes}, search(name, {city, limit}) => Doctor[], details(id) => Doctor } */
export const PROVIDERS = { paziresh24, doctoreto, nobat, drnext, darmankade };
export const IDS = Object.keys(PROVIDERS);

// Sites checked but NOT included: they don't offer the same "name -> free time -> price" search.
export const EXCLUDED = [
  ["دکتریاب (doctoryab)", "از داخل این شبکه در دسترس نبود / فهرست پزشک بدون نوبت لحظه‌ای"],
];

// ---------------------------------------------------------------- cache

const CACHE_MAX = 200;
const cache = new Map();

function cacheGet(key) {
  if (!config.cacheTtlSec) return null;
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > config.cacheTtlSec * 1000) {
    cache.delete(key);
    return null;
  }
  return structuredClone(hit.docs);
}

function cacheSet(key, docs) {
  if (!config.cacheTtlSec) return;
  cache.set(key, { at: Date.now(), docs: structuredClone(docs) });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

export const clearCache = () => cache.clear();

// ---------------------------------------------------------------- search

// The message carries no platform name: callers already show it next to the error.
function withDeadline(promise, ms) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`no answer within ${Math.round(ms / 1000)}s`), { code: "DEADLINE" })), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/** Remove repeated phones and duplicate services (the same office listed twice on a profile). */
function tidy(docs) {
  for (const d of docs) {
    for (const s of d.services) s.phones = [...new Set(s.phones || [])];
    const seen = new Set();
    d.services = d.services.filter((s) => {
      const k = [s.type, s.center, s.address, s.priceToman, s.firstFree?.getTime()].join("|");
      return seen.has(k) ? false : seen.add(k);
    });
  }
  return docs;
}

function shortError(e) {
  if (e?.code === "DEADLINE") return e.message;
  if (e?.cause?.code) return e.cause.code; // ENOTFOUND, ECONNRESET, UND_ERR_CONNECT_TIMEOUT, ...
  if (e?.name === "TimeoutError") return "timeout";
  if (e?.status) return `HTTP ${e.status}`;
  return String(e?.message || e).slice(0, 160);
}

/**
 * Search all (or selected) platforms in parallel. Never throws because of one platform:
 * a failing or slow site shows up in `platformStatus` with ok=false.
 */
export async function searchAll(name, { city, platforms = IDS, limit = 5 } = {}) {
  name = String(name ?? "").replace(/\s+/g, " ").trim();
  city = city ? String(city).replace(/\s+/g, " ").trim() || undefined : undefined;
  const started = Date.now();
  const results = await Promise.all(
    platforms.map(async (id) => {
      const p = PROVIDERS[id];
      if (!p) return { status: { id, name: id, site: null, ok: false, error: "unknown platform", count: 0, ms: 0 }, docs: [] };
      const key = JSON.stringify([id, normalizeFa(name), normalizeFa(city || ""), limit]);
      const t = Date.now();
      const cached = cacheGet(key);
      if (cached) return { status: { ...p.info, ok: true, count: cached.length, ms: 0, cached: true }, docs: cached };
      try {
        const docs = tidy(await withDeadline(p.search(name, { city, limit }), config.platformDeadlineMs));
        cacheSet(key, docs);
        return { status: { ...p.info, ok: true, count: docs.length, ms: Date.now() - t }, docs };
      } catch (e) {
        log.warn("platform search failed", { platform: id, error: e?.message, ms: Date.now() - t });
        return { status: { ...p.info, ok: false, error: shortError(e), count: 0, ms: Date.now() - t }, docs: [] };
      }
    })
  );
  const platformStatus = results.map((r) => r.status);
  log.info("search done", {
    ms: Date.now() - started,
    doctors: results.reduce((n, r) => n + r.docs.length, 0),
    failed: platformStatus.filter((s) => !s.ok).map((s) => s.id),
  });
  return { doctors: results.flatMap((r) => r.docs), platformStatus };
}
