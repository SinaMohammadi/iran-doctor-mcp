// دکترتو — https://doctoreto.com
// Search:  doctoreto.com/search?keyword=   (Next.js page, data in __NEXT_DATA__)
// Profile: doctoreto.com/doctor/{slug}/{code}  -> "consultations" query: services with price (TOMAN) + next free time
import { http, nextData, reactQueries, nameMatches, cityMatches, citySlug, mapLimit, parseTehranLocal } from "../util.js";

const SITE = "https://doctoreto.com";
export const info = {
  id: "doctoreto",
  name: "دکترتو",
  site: SITE,
  app: "اپلیکیشن دکترتو (اندروید/iOS)",
  notes: "نوبت حضوری (رزرو رایگان، پرداخت ویزیت در مطب) + مشاوره تلفنی/متنی/تصویری با قیمت مشخص به تومان.",
};

// Doctoreto service "type": 0 office, 1 phone, 2 text, 3 video
const TYPE = { 0: "in_person", 1: "online_phone", 2: "online_text", 3: "online_video" };

function baseDoctor(x) {
  return {
    platform: info.id,
    platformName: info.name,
    id: (x.profileRoute || `/doctor/${x.slug}`).replace(/^\/doctor\//, ""),
    name: (x.fullName || "").trim(),
    specialty: x.title || x.specialityLabel || x.specialities?.[0]?.title || null,
    city: x.cities?.map((c) => c.name).join("، ") || null,
    rating: x.rate?.rateAverage ?? null,
    ratingCount: x.rate?.count ?? null,
    satisfaction: x.rate?.percent ?? null,
    insurances: x.isInsurance ? ["پوشش بیمه دارد"] : [],
    profileUrl: `${SITE}${x.profileRoute || `/doctor/${x.slug}`}`,
    services: [],
    notes: [],
  };
}

function servicesFromSearch(x, url) {
  const out = [];
  for (const [k, v] of Object.entries(x.nextFreeTimes || {})) {
    const type = k === "general" ? "in_person" : k === "voice" ? "online_phone" : k === "video" ? "online_video" : "online_text";
    out.push({
      type, label: v?.context?.name || null, priceToman: null,
      priceNote: type === "in_person" ? "رزرو رایگان؛ حق ویزیت در مطب" : "قیمت در پروفایل",
      firstFree: v?.date ? new Date(v.date) : null,
      firstFreeLabel: (v?.fullTextDisplay || "").replace(/\s*\|\s*undefined/, "") || null,
      center: x.places?.[0]?.address || null, address: x.places?.[0]?.address || null, phones: [], bookingUrl: url,
    });
  }
  return out;
}

function servicesFromProfile(html, url) {
  const nd = nextData(html);
  let list = null;
  for (const q of reactQueries(nd)) {
    const d = q.state?.data;
    if (q.queryKey[0] === "consultations" && Array.isArray(d)) { list = d; break; }
    if (!list && Array.isArray(d) && d[0] && typeof d[0] === "object" && "paymentType" in d[0]) list = d;
  }
  if (!list) return null;
  return list.map((s) => {
    const type = TYPE[s.type] || "online";
    const nft = s.nextFreeTime || {};
    const price = Number(s.price?.price) || 0;
    return {
      type,
      label: s.typeName || s.title || null,
      priceToman: price > 0 ? price : null,
      priceNote: price > 0 ? null : type === "in_person" ? "رزرو رایگان؛ حق ویزیت در مطب" : "قیمت اعلام نشده",
      firstFree: nft.isAvailable ? parseTehranLocal(nft.datetime) : null,
      firstFreeLabel: nft.isAvailable ? `${nft.shamsiDate || ""} ${nft.shamsiTime || ""}`.trim() : nft.message || "نوبت خالی ندارد",
      center: s.place?.name || (type === "in_person" ? null : "آنلاین"),
      address: s.place?.address || null,
      phones: s.place?.phone || [],
      bookingUrl: url,
    };
  });
}

async function searchRaw(name, slug) {
  const html = await http(`${SITE}/search?keyword=${encodeURIComponent(name)}${slug ? `&citySlug=${encodeURIComponent(slug)}` : ""}`);
  for (const q of reactQueries(nextData(html))) {
    if (q.queryKey[0] === "doctors" && Array.isArray(q.state?.data?.data)) return q.state.data.data;
  }
  return [];
}

export async function search(name, { city, limit = 5 } = {}) {
  const slug = citySlug(city, "doctoreto");
  let items = slug ? await searchRaw(name, slug).catch(() => []) : [];
  if (!items.length) items = await searchRaw(name, null);
  const rows = items
    .filter((x) => x.fullName && nameMatches(name, x.fullName))
    .filter((x) => cityMatches(city, (x.cities || []).map((c) => c.name), (x.places || []).map((p) => p.address)))
    .slice(0, limit);

  return mapLimit(rows, 5, async (x) => {
    const doc = baseDoctor(x);
    try {
      doc.services = servicesFromProfile(await http(doc.profileUrl), doc.profileUrl) || servicesFromSearch(x, doc.profileUrl);
    } catch (e) {
      doc.services = servicesFromSearch(x, doc.profileUrl);
      doc.notes.push(`پروفایل کامل دریافت نشد (${e.message}).`);
    }
    if (!doc.services.length) doc.notes.push("نوبت‌دهی اینترنتی فعال نیست.");
    return doc;
  });
}

export async function details(id) {
  // Accept "slug/code" or a doctoreto.com URL; any other host is refused instead of being silently rewritten.
  const raw = String(id).trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\/(www\.)?doctoreto\.com(\/|$)/i.test(raw))
    throw new Error("Doctoreto id must be 'slug/code' (e.g. dr-mehran-ahmadi/GxbEdZ) or a doctoreto.com URL");
  const route = raw.replace(/^https?:\/\/[^/]+/i, "").replace(/[?#].*$/, "").replace(/^\/?(doctor\/)?/, "/doctor/");
  if (route.includes("..")) throw new Error("Doctoreto id must be 'slug/code' (e.g. dr-mehran-ahmadi/GxbEdZ) or a doctoreto.com URL");
  const url = `${SITE}${route}`;
  const html = await http(url);
  const nd = nextData(html);
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
  const doc = baseDoctor({ profileRoute: route, fullName: title.split(/[،,|-]/)[0].trim() });
  for (const q of reactQueries(nd)) {
    const d = q.state?.data;
    if (d && typeof d === "object" && !Array.isArray(d) && d.fullName && d.slug) {
      Object.assign(doc, baseDoctor({ ...d, profileRoute: route }));
      break;
    }
  }
  doc.services = servicesFromProfile(html, url) || [];
  return doc;
}
