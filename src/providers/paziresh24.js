// پذیرش۲۴ — https://www.paziresh24.com
// Search:  apigw.paziresh24.com/seapi/v1/search?text=   (JSON)
// Profile: drprofile.paziresh24.com/api/full-profile/{slug}   (JSON, prices in RIAL)
import { http, nameMatches, cityMatches, citySlug, mapLimit } from "../util.js";

const SITE = "https://www.paziresh24.com";
export const info = {
  id: "paziresh24",
  name: "پذیرش۲۴",
  site: SITE,
  app: "اپلیکیشن پذیرش۲۴ (اندروید/iOS/وب‌اپ)",
  notes: "بزرگ‌ترین شبکه نوبت‌دهی؛ نوبت حضوری + ویزیت آنلاین (واتساپ/ایتا/تماس امن). قیمت‌ها از API به ریال می‌آیند و به تومان تبدیل می‌شوند.",
};

const unixToDate = (s) => (s && Number(s) > 0 ? new Date(Number(s) * 1000) : null);

function onlineTypeFromTitle(title = "") {
  if (/متن|پیام|چت/.test(title)) return "online_text";
  if (/تصویر|ویدیو|ویدئو/.test(title)) return "online_video";
  if (/تلفن|تماس/.test(title)) return "online_phone";
  return "online"; // واتساپ / ایتا: any channel
}

function servicesFromProfile(profile) {
  const out = [];
  for (const c of profile.centers || []) {
    if (c.is_active === false) continue;
    const online = Number(c.center_type) === 3 || /ویزیت آنلاین/.test(c.name || "");
    for (const s of c.services || []) {
      if (s.can_booking === 0) continue;
      const ft = (c.freeturns_info || []).find((f) => f.service_id === s.id);
      const first = unixToDate(ft?.freeturn) || unixToDate(c.freeturn);
      const rial = Number(s.free_price) || 0;
      out.push({
        type: online ? onlineTypeFromTitle(s.alias_title) : "in_person",
        label: s.alias_title || (online ? "ویزیت آنلاین" : "ویزیت"),
        priceToman: rial > 0 ? rial / 10 : null,
        // For office visits Paziresh24 shows the amount paid online at booking; the clinic may charge the rest.
        priceNote: rial > 0 ? (online ? null : "پرداخت هنگام رزرو") : online ? "قیمت اعلام نشده" : "حق ویزیت در مطب",
        firstFree: first,
        firstFreeLabel: c.freeturn_text || null,
        center: online ? "ویزیت آنلاین پذیرش۲۴" : c.name,
        address: online ? null : [c.city, c.address].filter(Boolean).join("، "),
        phones: online ? [] : c.display_number_array || c.tell_array || [],
        bookingUrl: `${SITE}/dr/${profile.slug}/`,
      });
    }
  }
  return out;
}

function servicesFromSearch(r) {
  // Fallback when the profile call fails: search results carry first turns + online price.
  const out = [];
  const url = `${SITE}${r.url || `/dr/${r.slug}/`}`;
  if (r.presence_active_booking || r.presence_freeturn) {
    out.push({
      type: "in_person", label: "نوبت حضوری", priceToman: null, priceNote: "حق ویزیت در مطب",
      firstFree: unixToDate(r.presence_freeturn), center: r.centers?.find((c) => c.center_type !== 3)?.name,
      address: r.display_address, phones: [], bookingUrl: url,
    });
  }
  if (r.consult_active_booking || r.consult_freeturn) {
    const rial = r.consult_services?.[0]?.free_price;
    out.push({
      type: "online", label: "ویزیت آنلاین", priceToman: rial ? rial / 10 : null, priceNote: rial ? null : "قیمت اعلام نشده",
      firstFree: unixToDate(r.consult_freeturn), center: "ویزیت آنلاین پذیرش۲۴", address: null, phones: [], bookingUrl: url,
    });
  }
  return out;
}

function baseDoctor(r) {
  const office = (r.centers || []).find((c) => Number(c.center_type) !== 3) || r.centers?.[0];
  return {
    platform: info.id,
    platformName: info.name,
    id: r.slug || (r.url || "").replace(/^\/dr\/|\/$/g, ""),
    name: [r.prefix, r.display_name || r.title].filter(Boolean).join(" ").trim(),
    specialty: [...new Set(String(r.display_expertise || r.expertise || "").split(/\s*[,،]\s*/).filter(Boolean))].join("، ") || null,
    city: office?.city_name || null,
    rating: r.star ?? r.rate_info?.rate ?? null,
    ratingCount: r.rates_count ?? r.rate_info?.rates_count ?? null,
    satisfaction: r.satisfaction ?? null,
    insurances: r.insurances || [],
    profileUrl: `${SITE}${r.url || `/dr/${r.slug}/`}`,
    services: [],
    notes: [],
  };
}

async function profile(slug) {
  const j = await http(`https://drprofile.paziresh24.com/api/full-profile/${encodeURIComponent(slug)}`, { json: true });
  if (j.status !== "SUCCESS" || !j.data) throw new Error("profile not found");
  return j.data;
}

async function searchRaw(name, slug) {
  const path = slug ? `/${encodeURIComponent(slug)}` : "";
  const j = await http(`https://apigw.paziresh24.com/seapi/v1/search${path}?text=${encodeURIComponent(name)}`, { json: true });
  return j?.search?.result || [];
}

export async function search(name, { city, limit = 5 } = {}) {
  // City-scoped search (/search/{slug}) so local doctors aren't crowded out by other cities.
  const slug = citySlug(city, "paziresh24");
  let result = slug ? await searchRaw(name, slug).catch(() => []) : [];
  if (!result.some((r) => r.type === "doctor")) result = await searchRaw(name, null);
  const rows = result
    .filter((r) => r.type === "doctor")
    .filter((r) => nameMatches(name, r.display_name || r.title || ""))
    .filter((r) => cityMatches(city, (r.centers || []).map((c) => c.city_name), r.display_address))
    .slice(0, limit);

  return mapLimit(rows, 5, async (r) => {
    const doc = baseDoctor(r);
    try {
      doc.services = servicesFromProfile(await profile(doc.id));
    } catch (e) {
      doc.services = servicesFromSearch(r);
      doc.notes.push(`پروفایل کامل دریافت نشد (${e.message})؛ از داده جستجو استفاده شد.`);
    }
    if (!doc.services.length) doc.notes.push("نوبت‌دهی اینترنتی برای این پزشک فعال نیست.");
    return doc;
  });
}

export async function details(slug) {
  slug = decodeURIComponent(String(slug)).replace(/^.*\/dr\//, "").replace(/\/$/, "");
  const p = await profile(slug);
  const doc = baseDoctor({
    slug: p.slug, display_name: p.display_name, prefix: "", url: `/dr/${p.slug}/`,
    display_expertise: p.expertises?.[0]?.alias_title || p.expertises?.[0]?.expertise?.name,
    centers: (p.centers || []).map((c) => ({ ...c, city_name: c.city })),
  });
  doc.services = servicesFromProfile(p);
  doc.visits = p.number_of_visits ?? null;
  return doc;
}
