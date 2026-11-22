// دکترنکست — https://drnext.ir
// Search:  cyclops.drnext.ir/v1/website/doctors/search?query=     (JSON)
// Details: cyclops.drnext.ir/v1/website/doctors/{id}/details        (JSON, prices in RIAL)
import { http, nameMatches, cityMatches, mapLimit, parseTehranLocal } from "../util.js";

const API = "https://cyclops.drnext.ir";
const SITE = "https://drnext.ir";
export const info = {
  id: "drnext",
  name: "دکترنکست",
  site: SITE,
  app: "اپلیکیشن دکترنکست (اندروید/iOS)",
  notes: "نوبت حضوری + ویزیت مجازی (تلفنی/متنی) و تصویری؛ اولین زمان خالی و قیمت مستقیم از API (ریال → تومان).",
};

const rialToToman = (r) => (Number(r) > 0 ? Number(r) / 10 : null);

function build(d) {
  const url = `${SITE}/doctor/${d.seoId || d.id}`;
  const offices = d.offices || [];
  const physical = offices.filter((o) => !o.isVirtual);
  const cityNames = offices.map((o) => o.city?.name).filter(Boolean);
  const doc = {
    platform: info.id,
    platformName: info.name,
    id: d.id,
    name: (d.persianFullname || `${d.persianFirstName || ""} ${d.persianLastName || ""}`).trim(),
    specialty: d.speciality?.name || null,
    city: [...new Set(cityNames)].join("، ") || null,
    rating: d.rate != null ? Number(d.rate) : null,
    ratingCount: d.rateCount || null,
    satisfaction: null,
    insurances: (d.insurances || []).map((i) => i.name || i).filter((x) => typeof x === "string"),
    profileUrl: url,
    services: [],
    notes: [],
  };
  const clinic = (key) => physical.find((o) => o.id === key || o.name === key) || physical[0];

  if (d.firstFreeTime || d.firstFreeTimePrice) {
    const o = clinic(d.firstFreeTimeClinic?.id || d.firstFreeTimeClinic);
    const price = rialToToman(d.firstFreeTimeClinicPrice ?? d.firstFreeTimePrice ?? o?.OfficeDoctor?.price);
    doc.services.push({
      type: "in_person", label: "نوبت حضوری",
      priceToman: price, priceNote: price ? null : "حق ویزیت در مطب",
      firstFree: parseTehranLocal(d.firstFreeTime), firstFreeLabel: d.firstFreeTime ? null : "نوبت خالی ندارد",
      center: o?.name || d.firstFreeTimeClinic?.name || null,
      address: o ? [o.city?.name, o.address].filter(Boolean).join("، ") : null,
      phones: o?.telephone && !/^0+$/.test(o.telephone) ? [o.telephone] : [],
      bookingUrl: url,
    });
    if (Number(d.depositPrice) > 0) doc.notes.push(`بیعانه رزرو حضوری: ${(d.depositPrice / 10).toLocaleString("en-US")} تومان`);
  }
  if (d.virtualFirstFreeTime || d.virtualVisitData?.price) {
    const price = rialToToman(d.virtualVisitData?.price ?? d.virtualFirstFreeTimeClinicPrice ?? d.virtualVisitPrice);
    doc.services.push({
      type: "online", label: "ویزیت مجازی (تلفنی/پیام‌رسان)",
      priceToman: price, priceNote: price ? null : "قیمت در پروفایل",
      firstFree: parseTehranLocal(d.virtualFirstFreeTime), firstFreeLabel: d.virtualFirstFreeTime ? null : "نوبت خالی ندارد",
      center: "آنلاین", address: null, phones: [], bookingUrl: url,
    });
  }
  if (d.videoCallFirstFreeTime || d.virtualVisitVideoCallData?.price) {
    const price = rialToToman(d.virtualVisitVideoCallData?.price ?? d.videoCallFirstFreeTimeClinicPrice);
    doc.services.push({
      type: "online_video", label: "ویزیت تصویری",
      priceToman: price, priceNote: price ? null : "قیمت در پروفایل",
      firstFree: parseTehranLocal(d.videoCallFirstFreeTime), firstFreeLabel: d.videoCallFirstFreeTime ? null : "نوبت خالی ندارد",
      center: "آنلاین", address: null, phones: [], bookingUrl: url,
    });
  }
  if (!doc.services.length) {
    const o = physical[0];
    if (o) doc.notes.push(`نوبت آنلاین فعال نیست. مطب: ${[o.name, o.city?.name, o.address].filter(Boolean).join("، ")}`);
    else doc.notes.push("نوبت آنلاین فعال نیست.");
  }
  return doc;
}

async function fetchDetails(id) {
  const j = await http(`${API}/v1/website/doctors/${encodeURIComponent(id)}/details`, { json: true, headers: { Origin: SITE } });
  if (!j?.data) throw new Error("doctor not found");
  return j.data;
}

export async function search(name, { city, limit = 5 } = {}) {
  const j = await http(`${API}/v1/website/doctors/search?query=${encodeURIComponent(name)}`, { json: true, headers: { Origin: SITE } });
  const rows = (j?.data?.doctor || []).filter((d) => nameMatches(name, d.persianFullname || ""));
  // Pull details for a few more than needed so the city filter (needs office city) still yields `limit` rows.
  const candidates = rows.slice(0, city ? Math.max(limit * 3, 15) : limit);
  const docs = await mapLimit(candidates, 5, async (d) => {
    try {
      return build({ ...d, ...(await fetchDetails(d.id)) });
    } catch (e) {
      const doc = build(d);
      doc.notes.push(`جزئیات کامل دریافت نشد (${e.message}).`);
      return doc;
    }
  });
  return docs.filter((d) => cityMatches(city, d.city)).slice(0, limit);
}

export async function details(id) {
  return build(await fetchDetails(String(id).replace(/^.*\/doctor\//, "")));
}
