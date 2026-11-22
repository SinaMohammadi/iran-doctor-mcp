// درمانکده — https://www.darmankade.com
// Search:  search.darmankade.com/search?query=      (JSON)
// Profile: www.darmankade.com/doctor/{userId}/       (Next.js; "doctor" query -> products: price TOMAN + firstAvailable)
import { http, nextData, reactQueries, nameMatches, cityMatches, mapLimit, parseTehranLocal } from "../util.js";

const SITE = "https://www.darmankade.com";
export const info = {
  id: "darmankade",
  name: "درمانکده",
  site: SITE,
  app: "وب‌سایت/وب‌اپ درمانکده",
  notes: "نوبت حضوری + مشاوره آنلاین تلفنی/متنی/صوتی/تصویری با اولین زمان خالی و قیمت به تومان.",
};

// productId -> visit type (mapped against the search API's productName per doctor)
const PRODUCT = {
  1: ["in_person", "نوبت حضوری"],
  7: ["online_text", "مشاوره آنلاین متنی"],
  8: ["online_audio", "مشاوره آنلاین صوتی"],
  9: ["online_video", "مشاوره آنلاین تصویری"],
  19: ["online_phone", "مشاوره آنلاین تلفنی"],
};

function baseDoctor(p) {
  return {
    platform: info.id,
    platformName: info.name,
    id: String(p.userId),
    name: (p.name || `${p.firstName || ""} ${p.lastName || ""}`).trim(),
    specialty: [p.levelName, p.fieldName].filter(Boolean).join(" ") || null,
    city: p.district || null,
    rating: null,
    ratingCount: null,
    satisfaction: null,
    insurances: [],
    profileUrl: `${SITE}/doctor/${p.userId}/`,
    services: [],
    notes: [],
  };
}

function parseProfile(html, doc) {
  const nd = nextData(html);
  let d = null;
  for (const q of reactQueries(nd)) {
    if (q.queryKey[0] === "doctor" && q.state?.data && typeof q.state.data === "object") { d = q.state.data; break; }
  }
  if (!d) throw new Error("doctor data not found");
  if (!doc.name || doc.name === "undefined") doc.name = `${d.firstName || ""} ${d.lastName || ""}`.trim();
  doc.specialty ||= [d.levelName, d.fieldName].filter(Boolean).join(" ");
  if (d.commentCount) doc.ratingCount = d.commentCount;
  const centers = Object.fromEntries((d.centers || []).map((c) => [c.id, c]));
  const insurances = new Set();
  doc.services = (d.products || []).map((p) => {
    const [type, label] = PRODUCT[p.productId] || [p.categoryId === 1 ? "in_person" : "online", p.categoryId === 1 ? "نوبت حضوری" : "مشاوره آنلاین"];
    const c = centers[p.centerId];
    const price = Number(p.price) || 0;
    if (p.isInsuranceSupported && p.insuranceName) insurances.add(p.insuranceName);
    const first = parseTehranLocal(p.firstAvailable);
    return {
      type, label,
      priceToman: price > 0 ? price : null,
      priceNote: price > 0 ? null : type === "in_person" ? "حق ویزیت در مطب" : "قیمت اعلام نشده",
      firstFree: first,
      firstFreeLabel: first ? null : "نوبت خالی ندارد",
      center: type === "in_person" ? c?.name || null : "آنلاین",
      address: type === "in_person" ? [p.city, p.address && p.address !== "-" ? p.address : c?.address].filter((x) => x && x !== "-").join("، ") : null,
      phones: type === "in_person" && c?.phone ? [c.phone] : [],
      waitingMinutes: c?.waitingTime ? Number(c.waitingTime) : null,
      bookingUrl: doc.profileUrl,
    };
  });
  doc.insurances = [...insurances];
  return doc;
}

const searchRaw = async (name, city) =>
  (
    await http(
      `https://search.darmankade.com/search?query=${encodeURIComponent(name)}${city ? `&city=${encodeURIComponent(city)}` : ""}`,
      { json: true, headers: { Origin: SITE } }
    )
  )?.profile || [];

export async function search(name, { city, limit = 5 } = {}) {
  // The search API accepts the Persian city name directly.
  let profiles = city ? await searchRaw(name, city).catch(() => []) : [];
  if (!profiles.length) profiles = await searchRaw(name, null);
  const rows = profiles
    .filter((p) => nameMatches(name, p.name || `${p.firstName} ${p.lastName}`))
    .filter((p) => cityMatches(city, p.district))
    .slice(0, limit);
  return mapLimit(rows, 5, async (p) => {
    const doc = baseDoctor(p);
    if (String(p.isActive) === "False") {
      doc.notes.push("نوبت‌دهی آنلاین این پزشک در درمانکده غیرفعال است.");
      return doc;
    }
    try {
      parseProfile(await http(doc.profileUrl), doc);
    } catch (e) {
      doc.notes.push(`پروفایل دریافت نشد (${e.message}). خدمات: ${p.productName || "-"}`);
    }
    if (!doc.services.length && !doc.notes.length) doc.notes.push("نوبت خالی ثبت نشده است.");
    return doc;
  });
}

export async function details(id) {
  const uid = String(id).match(/(\d+)/)?.[1];
  if (!uid) throw new Error("Darmankade id must be the numeric doctor id (e.g. 423925)");
  const doc = baseDoctor({ userId: uid });
  return parseProfile(await http(doc.profileUrl), doc);
}
