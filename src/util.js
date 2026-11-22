// Shared helpers: HTTP, Persian text normalisation, Tehran time, Jalali calendar.
import { config } from "./config.js";
import { log } from "./log.js";

export const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

// ---------------------------------------------------------------- HTTP

/** Only these sites (and their subdomains) may ever be fetched — also after redirects. Prevents SSRF via user-supplied ids/URLs. */
export const ALLOWED_HOSTS = ["paziresh24.com", "doctoreto.com", "nobat.ir", "drnext.ir", "darmankade.com"];

export function isAllowedUrl(u) {
  try {
    const x = new URL(u);
    if (x.protocol !== "https:" && x.protocol !== "http:") return false;
    if (x.username || x.password) return false;
    const h = x.hostname.toLowerCase();
    return ALLOWED_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

export class HttpError extends Error {
  constructor(message, { status, url, retryable = false, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "HttpError";
    this.status = status;
    this.url = url;
    this.retryable = retryable;
  }
}

async function readBody(res, max, url) {
  const declared = Number(res.headers.get("content-length"));
  if (declared > max) throw new HttpError(`response too large (${declared} bytes)`, { url });
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw new HttpError(`response too large (> ${max} bytes)`, { url });
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

/**
 * GET a page or JSON from an allowed booking site.
 * Retries (with backoff) only on network errors, timeouts, 429 and 5xx — never on other 4xx.
 */
export async function http(url, { json = false, headers = {}, retries = config.retries, timeoutMs = config.requestTimeoutMs } = {}) {
  if (!isAllowedUrl(url)) throw new HttpError(`blocked URL (not a supported booking site): ${String(url).slice(0, 120)}`, { url });
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 400 * 2 ** (attempt - 1) + Math.random() * 200));
    const t = Date.now();
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": UA,
          Accept: json ? "application/json, text/plain, */*" : "text/html,application/xhtml+xml,*/*",
          "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.5",
          ...headers,
        },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.url && !isAllowedUrl(res.url)) throw new HttpError(`redirected to a blocked host: ${res.url}`, { url });
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        throw new HttpError(`HTTP ${res.status} for ${url}`, { status: res.status, url, retryable: res.status === 429 || res.status >= 500 });
      }
      const body = await readBody(res, config.maxResponseBytes, url);
      log.debug("http ok", { url, ms: Date.now() - t, bytes: body.length, attempt });
      if (!json) return body;
      try {
        return JSON.parse(body);
      } catch (e) {
        throw new HttpError(`invalid JSON from ${url}`, { url, cause: e });
      }
    } catch (e) {
      const retryable = e instanceof HttpError ? e.retryable : true; // network error / timeout
      lastErr = e;
      log.debug("http fail", { url, ms: Date.now() - t, attempt, error: e.message, retryable });
      if (!retryable) break;
    }
  }
  throw lastErr;
}

/** Extract and parse the Next.js __NEXT_DATA__ blob from an HTML page. */
export function nextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("__NEXT_DATA__ not found (page layout changed?)");
  return JSON.parse(m[1]);
}

/** Yield every react-query entry ({queryKey, state}) found anywhere in an object. */
export function* reactQueries(obj) {
  const stack = [obj];
  while (stack.length) {
    const o = stack.pop();
    if (!o || typeof o !== "object") continue;
    if (Array.isArray(o.queryKey) && o.state) yield o;
    for (const v of Array.isArray(o) ? o : Object.values(o)) {
      if (v && typeof v === "object") stack.push(v);
    }
  }
}

// ---------------------------------------------------------------- text

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function toLatinDigits(s) {
  return String(s ?? "").replace(/[۰-۹٠-٩]/g, (d) => {
    const i = FA_DIGITS.indexOf(d);
    return String(i >= 0 ? i : AR_DIGITS.indexOf(d));
  });
}

const TITLE_WORDS = new Set(["دکتر", "دكتر", "پروفسور", "استاد", "dr", "dr.", "prof", "prof."]);

/** Normalise Persian text for comparison (Arabic letters, ZWNJ, diacritics, titles). */
export function normalizeFa(s) {
  return toLatinDigits(s)
    .replace(/ي/g, "ی")
    .replace(/ى/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ۀة]/g, "ه")
    .replace(/[أإآ]/g, "ا")
    .replace(/[ً-ٰٟ]/g, "") // harakat
    .replace(/[‌‍‎‏]/g, " ") // ZWNJ & marks -> space
    .replace(/[\-_.،,()]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w && !TITLE_WORDS.has(w))
    .join(" ");
}

/** Every token of the query must appear in the name (as a substring of the joined name). */
export function nameMatches(query, name) {
  const q = normalizeFa(query).split(" ").filter(Boolean);
  if (!q.length) return false;
  const n = normalizeFa(name);
  const nJoined = n.replace(/ /g, "");
  return q.every((t) => n.includes(t) || nJoined.includes(t));
}

// City slugs verified against each site (2026-11). `d` falls back to `p` when Doctoreto's slug wasn't confirmed.
const CITY_SLUGS = {
  تهران: ["tehran", "tehran"], اصفهان: ["isfahan", "esfahan"], مشهد: ["mashhad", "mashhad"], شیراز: ["shiraz", "shiraz"],
  تبریز: ["tabriz", "tabriz"], کرج: ["karaj", "karaj"], اهواز: ["ahvaz", "ahvaz"], قم: ["qom", "qom"], رشت: ["rasht", "rasht"],
  کرمانشاه: ["kermanshah", "kermanshah"], ارومیه: ["orumieh", "orumieh"], یزد: ["yazd", "yazd"], کرمان: ["kerman", "kerman"],
  همدان: ["hamedan", "hamedan"], اراک: ["arak", "arak"], ساری: ["sari", "sari"], زاهدان: ["zahedan", "zahedan"],
  بندرعباس: ["bandar-abbas", "bandar-abbas"], قزوین: ["qazvin", "qazvin"], گرگان: ["gorgan", "gorgan"], سنندج: ["sanandaj", "sanandaj"],
  اردبیل: ["ardabil", "ardabil"], زنجان: ["zanjan", "zanjan"], بوشهر: ["bushehr", "boshehr"], خرمآباد: ["khorramabad", "khorramabad"],
  کاشان: ["kashan", "kashan"], بابل: ["babol", "babol"], شهرکرد: ["shahrekord", "shahrekord"], سمنان: ["semnan", "semnan"],
  بیرجند: ["birjand", "birjand"], ایلام: ["ilam", "ilam"], یاسوج: ["yasuj", "yasuj"], آمل: ["amol", "amol"], دزفول: ["dezful", "dezful"],
  نیشابور: ["neyshabur", "neyshabur"], قائمشهر: ["qaemshahr", "qaemshahr"], سبزوار: ["sabzevar", "sabzevar"],
  بجنورد: ["bojnurd", "bojnourd"], اسلامشهر: ["eslamshahr", "eslamshahr"],
};
const CITY_INDEX = Object.fromEntries(Object.entries(CITY_SLUGS).map(([k, v]) => [normalizeFa(k).replace(/ /g, ""), v]));

/** English URL slug of a Persian city name for a site ("paziresh24" | "doctoreto"), or null if unknown. */
export function citySlug(city, site) {
  if (!city) return null;
  const v = CITY_INDEX[normalizeFa(city).replace(/ /g, "")];
  if (!v) return /^[a-z-]+$/i.test(city.trim()) ? city.trim().toLowerCase() : null;
  return site === "doctoreto" ? v[1] : v[0];
}

export function cityMatches(city, ...candidates) {
  if (!city) return true;
  const c = normalizeFa(city);
  return candidates.flat().some((x) => x && normalizeFa(x).includes(c));
}

export function stripTags(html) {
  return String(html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------- time
// Iran Standard Time is UTC+03:30 with no DST (abolished in 2022).

const TEHRAN_OFFSET_MIN = 210;

/** "2026-11-18 14:00[:00]" or "2026-11-18T14:00:00" (Tehran local, no zone) -> Date */
export function parseTehranLocal(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m.map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi, se || 0) - TEHRAN_OFFSET_MIN * 60000);
}

function tehranParts(date) {
  const t = new Date(date.getTime() + TEHRAN_OFFSET_MIN * 60000);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    hh: t.getUTCHours(),
    mm: t.getUTCMinutes(),
    wd: t.getUTCDay(),
  };
}

export function toTehranISO(date) {
  if (!date) return null;
  const p = tehranParts(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.hh)}:${pad(p.mm)}:00+03:30`;
}

const WEEKDAYS = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
const J_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];

/** Latin digits -> Persian digits (for display text only; never for URLs or phone numbers). */
export function faDigits(s) {
  return String(s ?? "").replace(/[0-9]/g, (d) => FA_DIGITS[d]);
}

/** Persian number with thousands separator: 150000 -> "۱۵۰٬۰۰۰" */
export const faNum = (n) => (n == null ? null : Math.round(n).toLocaleString("fa-IR"));

/** Calendar days between today and `date` (Tehran time). */
export function dayDiffTehran(date) {
  const p = tehranParts(date);
  const now = tehranParts(new Date());
  return Math.round((Date.UTC(p.y, p.m - 1, p.d) - Date.UTC(now.y, now.m - 1, now.d)) / 86400000);
}

function relativeDay(diff) {
  if (diff === 0) return "امروز";
  if (diff === 1) return "فردا";
  if (diff === 2) return "پس‌فردا";
  if (diff > 2 && diff < 14) return `${faDigits(diff)} روز دیگر`;
  if (diff >= 14 && diff < 60) return `حدود ${faDigits(Math.round(diff / 7))} هفته دیگر`;
  if (diff >= 60) return `حدود ${faDigits(Math.round(diff / 30))} ماه دیگر`;
  return null;
}

/** Human Persian label: "چهارشنبه ۲۷ آبان، ساعت ۱۵:۳۰ (امروز)" */
export function formatFa(date, { withTime = true, relative = true } = {}) {
  if (!date) return null;
  const p = tehranParts(date);
  const [, jm, jd] = gregorianToJalali(p.y, p.m, p.d);
  const rel = relative ? relativeDay(dayDiffTehran(date)) : null;
  const time = withTime ? `، ساعت ${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}` : "";
  return faDigits(`${WEEKDAYS[p.wd]} ${jd} ${J_MONTHS[jm - 1]}${time}`) + (rel ? ` (${rel})` : "");
}

export function daysFromNow(date) {
  if (!date) return null;
  return (date.getTime() - Date.now()) / 86400000;
}

// ---------------------------------------------------------------- Jalali calendar

export function gregorianToJalali(gy, gm, gd) {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    355666 + 365 * gy + ~~((gy2 + 3) / 4) - ~~((gy2 + 99) / 100) + ~~((gy2 + 399) / 400) + gd + gdm[gm - 1];
  let jy = -1595 + 33 * ~~(days / 12053);
  days %= 12053;
  jy += 4 * ~~(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += ~~((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + ~~(days / 31) : 7 + ~~((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

export function jalaliToGregorian(jy, jm, jd) {
  jy += 1595;
  let days =
    -355668 + 365 * jy + ~~(jy / 33) * 8 + ~~(((jy % 33) + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * ~~(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * ~~(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * ~~(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += ~~((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const sal = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (gm = 0; gm < 13 && gd > sal[gm]; gm++) gd -= sal[gm];
  return [gy, gm, gd];
}

// ---------------------------------------------------------------- misc

export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

export const fmtToman = (n) => (n == null ? null : `${faNum(n)} تومان`);

/** Visit types used across all platforms. */
export const VISIT = {
  in_person: "حضوری",
  online_phone: "مشاوره تلفنی",
  online_text: "مشاوره متنی",
  online_video: "مشاوره تصویری",
  online_audio: "مشاوره صوتی",
  online: "ویزیت آنلاین",
};
export const isOnline = (t) => t !== "in_person";
