// نوبت دات آی آر — https://nobat.ir
// Search:  nobat.ir/118/?q=        (server-rendered HTML cards)
// Profile: nobat.ir/{slug|id}      (HTML: offices, phones, "day-box" list of open days with hours)
// Nobat does not publish visit prices: booking is free ("بدون کارمزد") and the visit is paid at the clinic.
import { http, nameMatches, cityMatches, mapLimit, stripTags, toLatinDigits, jalaliToGregorian, parseTehranLocal } from "../util.js";

const SITE = "https://nobat.ir";
export const info = {
  id: "nobat",
  name: "نوبت دات آی آر",
  site: SITE,
  app: "وب‌سایت nobat.ir (نسخه موبایل)",
  notes: "نوبت‌دهی اینترنتی حضوری بدون کارمزد؛ روزهای خالی و ساعت کاری مطب نمایش داده می‌شود؛ هزینه ویزیت آنلاین اعلام نمی‌شود.",
};

function parseCards(html) {
  const cards = [];
  const re = /<a id="(\d+)" href="([^"]+)" class="doctor-ui[^"]*"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const [, id, href, title, body] = m;
    const pick = (cls) => stripTags((body.match(new RegExp(`class="${cls}[^"]*"[^>]*>([\\s\\S]*?)</(?:div|span|h3)>`)) || [])[1]);
    const nameAttr = (body.match(/class="doctor-ui-name"[\s\S]*?title="([^"]+)"/) || [])[1];
    const specs = [...body.matchAll(/class="doctor-ui-specialty"[^>]*>([^<]*)</g)].map((x) => x[1].trim());
    const stars = Number((body.match(/stars-value" style="width:\s*(\d+)%/) || [])[1]);
    const votes = Number(toLatinDigits((body.match(/doctor-ui-rating"><span>([^<]*)</) || [])[1] || "").replace(/\D/g, ""));
    cards.push({
      id, href, title,
      name: nameAttr || pick("doctor-ui-name"),
      city: pick("doctor-ui-city"),
      specialty: specs.join("، ") || null,
      rating: stars ? Math.round((stars / 20) * 10) / 10 : null,
      ratingCount: votes || null,
    });
  }
  return cards;
}

function parseProfile(html, url) {
  const offices = {};
  for (const m of html.matchAll(/<div class="office" data-officeId="(\d+)">([\s\S]*?)(?=<div class="office" data-officeId=|<!-- Day Boxes|<\/div> <\/div> <!--)/g)) {
    const [, oid, body] = m;
    offices[oid] = {
      name: stripTags((body.match(/class="office-title">([\s\S]*?)<\/strong>/) || [])[1]),
      address: stripTags((body.match(/class="office-address"[^>]*>([\s\S]*?)<\/div>/) || [])[1]).replace(/\* توجه \*/g, "").trim(),
      phones: [...new Set([...body.matchAll(/href="tel:([^"]+)"/g)].map((x) => x[1]))],
    };
  }
  // Open days. Each box: data-dayKey=YYYYMMDD (Jalali) + "از ساعت HH:MM الی HH:MM"
  const days = [];
  const seen = new Set();
  for (const m of html.matchAll(/class="day-box([^"]*)" data-dayKey="(\d{8})" data-officeId="(\d+)"\s*>([\s\S]*?)<\/div><\/div><\/div>/g)) {
    const [, cls, key, oid, body] = m;
    if (seen.has(key + oid)) continue;
    seen.add(key + oid);
    const text = toLatinDigits(stripTags(body));
    const full = /full|disabled/.test(cls) || /تکمیل|پر شده/.test(text);
    const hours = text.match(/از ساعت\s*(\d{1,2}:\d{2})\s*(?:الی|تا)\s*(\d{1,2}:\d{2})/);
    const [gy, gm, gd] = jalaliToGregorian(+key.slice(0, 4), +key.slice(4, 6), +key.slice(6, 8));
    // Only the day is known; use the clinic's opening hour (or midday) so sorting isn't biased to 00:00.
    const date = parseTehranLocal(`${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")} ${(hours?.[1] || "12:00").padStart(5, "0")}`);
    days.push({ oid, key, full, date, hours: hours ? `${hours[1]} تا ${hours[2]}` : null, text });
  }
  const services = [];
  const officeIds = Object.keys(offices).length ? Object.keys(offices) : [...new Set(days.map((d) => d.oid))];
  for (const oid of officeIds) {
    const o = offices[oid] || {};
    const open = days.filter((d) => d.oid === oid && !d.full).sort((a, b) => a.date - b.date);
    const first = open[0];
    services.push({
      type: "in_person",
      label: "نوبت حضوری مطب",
      priceToman: null,
      priceNote: "نوبت بدون کارمزد؛ حق ویزیت در مطب",
      firstFree: first?.date || null,
      firstFreeLabel: first
        ? first.hours ? `ساعت کاری ${first.hours}` : null
        : days.length ? "همه روزها تکمیل" : /data-role="get-turn"/.test(html) ? "روز خالی اعلام نشده؛ در سایت/تلفنی بپرسید" : "نوبت اینترنتی ندارد؛ تلفنی",
      firstFreeIsDayOnly: true,
      openDays: open.slice(0, 7).map((d) => ({ date: d.date, hours: d.hours })),
      center: o.name || null,
      address: o.address || null,
      phones: o.phones || [],
      bookingUrl: url,
    });
  }
  return services;
}

const baseDoctor = (c) => ({
  platform: info.id,
  platformName: info.name,
  id: c.href.replace(/^https?:\/\/(www\.)?nobat\.ir\//, ""),
  name: (c.name || c.title).trim(),
  specialty: c.specialty,
  city: c.city || null,
  rating: c.rating,
  ratingCount: c.ratingCount,
  satisfaction: null,
  insurances: [],
  profileUrl: c.href,
  services: [],
  notes: [],
});

async function searchRaw(q) {
  const html = await http(`${SITE}/118/?q=${encodeURIComponent(q)}`);
  // Only the main result list (before "مطب های دیگر" related doctors)
  return parseCards(html.split("similar-doctors-title")[0]);
}

export async function search(name, { city, limit = 5 } = {}) {
  // Nobat's search is free text: "name city" returns doctors of that city.
  const match = (cards) => cards.filter((c) => nameMatches(name, c.name || c.title));
  let cards = city ? match(await searchRaw(`${name} ${city}`).catch(() => [])) : [];
  if (!cards.length) cards = match(await searchRaw(name));
  const rows = cards
    .filter((c) => cityMatches(city, c.city, c.title))
    .slice(0, limit);
  return mapLimit(rows, 5, async (c) => {
    const doc = baseDoctor(c);
    try {
      doc.services = parseProfile(await http(c.href), c.href);
    } catch (e) {
      doc.notes.push(`صفحه پزشک دریافت نشد (${e.message}).`);
    }
    if (!doc.services.length) doc.notes.push("نوبت اینترنتی در صفحه پزشک پیدا نشد؛ با مطب تماس بگیرید.");
    return doc;
  });
}

export async function details(id) {
  // Accept a slug ("35865", "o826") or a nobat.ir URL — always rebuilt on nobat.ir, never fetched as given.
  const path = String(id).trim().replace(/^https?:\/\/(www\.)?nobat\.ir/i, "").replace(/^\/+/, "");
  if (!path || /^[a-z]+:/i.test(path) || path.includes("..")) throw new Error("Nobat id must be the doctor page slug (e.g. 35865) or a nobat.ir URL");
  const url = `${SITE}/${path}`;
  const html = await http(url);
  const name = stripTags((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1]) || null;
  const doc = baseDoctor({ href: url, name, title: name || "" });
  doc.services = parseProfile(html, url);
  return doc;
}
