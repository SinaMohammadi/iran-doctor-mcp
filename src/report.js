// Builds the final Persian report for a patient:
//   summary → one block per doctor (same person across platforms) → best options → next steps → platform status.
import { formatFa, normalizeFa, toTehranISO, VISIT, isOnline, faDigits, faNum } from "./util.js";

const cell = (s) => String(s ?? "—").replace(/\|/g, "／").replace(/\n/g, " ").trim() || "—";
const uniq = (a) => [...new Set((a || []).filter(Boolean))];
const short = (s, n = 45) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim().replace(/[.。]$/, "");
  return t.length > n ? `${t.slice(0, n - 1).trim()}…` : t;
};
const firstCity = (d) => d.city?.split(/[،,]/)[0]?.trim() || null;

// ---------------------------------------------------------------- labels

function whenLabel(s) {
  if (!s.firstFree) return short(s.firstFreeLabel || "نوبت خالی ندارد", 40);
  const day = formatFa(s.firstFree, { withTime: !s.firstFreeIsDayOnly });
  return s.firstFreeIsDayOnly && s.firstFreeLabel ? `${day} — ${faDigits(s.firstFreeLabel)}` : day;
}

function priceLabel(s) {
  if (s.priceToman != null) {
    const note = s.priceNote ? ` (${s.priceNote.replace(/^پرداخت /, "")})` : "";
    return `${faNum(s.priceToman)} تومان${note}`;
  }
  if (/در مطب/.test(s.priceNote || "")) return "رزرو رایگان؛ ویزیت در مطب پرداخت می‌شود";
  return s.priceNote ? faDigits(s.priceNote) : "اعلام نشده";
}

/** Clinic + short address for an in-person service ("" for online services). */
function whereOf(s, city, max = 50) {
  if (isOnline(s.type)) return "";
  const strip = (x) =>
    String(x || "")
      .split(/[،,]/)
      .map((t) => t.trim())
      .filter((t) => t && (!city || normalizeFa(t) !== normalizeFa(city)))
      .join("، ");
  const center = strip(String(s.center || "").replace(/^آدرس و تلفن /, ""));
  const addr = strip(s.address);
  const where = [center, addr && !center.includes(addr) && addr !== center ? addr : null].filter(Boolean).join("، ");
  return where ? short(where, max) : "";
}

/** "حضوری — مطب X، قیطریه" / "مشاوره تلفنی" */
function serviceLabel(s, city) {
  const type = VISIT[s.type] || s.label || "—";
  const where = whereOf(s, city);
  return where ? `${type} — ${where}` : type;
}

/** Best known clinic/location of a doctor (used when there is no bookable slot). */
function officeOf(g, max = 50) {
  return uniq(
    g.docs.flatMap((d) => [
      ...d.services.filter((s) => s.type === "in_person").map((s) => whereOf(s, g.city, max)),
      ...(d.notes || []).map((n) => (n.match(/مطب: (.+)/) || [])[1]).filter(Boolean).map((x) => short(x, max)),
    ])
  )[0] || null;
}

function ratingLabel(d) {
  if (d.rating == null || (!d.rating && !d.ratingCount)) return null;
  const parts = [`⭐ ${faDigits(Number(d.rating).toFixed(1)).replace(".", "٫")} از ۵`];
  if (d.ratingCount) parts.push(`${faNum(d.ratingCount)} نظر`);
  if (d.satisfaction != null) parts.push(`رضایت ${faDigits(d.satisfaction)}٪`);
  return parts.length > 1 ? `${parts[0]} (${parts.slice(1).join("، ")})` : parts[0];
}

// ---------------------------------------------------------------- grouping (same person across platforms)

// Canonical medical field, so "کارشناسی ارشد کار درمانی" == "کارشناس ارشد کاردرمانی" and
// "فوق تخصص زنان و زایمان" == "متخصص زنان و زایمان", but a cardiologist is never merged with a midwife.
// Order matters: more specific fields first.
const FIELDS = [
  ["روانپزشکی", /روانپزشک|اعصابوروان/],
  ["روانشناسی و مشاوره", /روانشناس|مشاوره|رواندرمان/],
  ["مغز و اعصاب", /مغزواعصاب|نورولوژ/],
  ["کاردرمانی", /کاردرمان/],
  ["گفتاردرمانی", /گفتاردرمان/],
  ["فیزیوتراپی", /فیزیوتراپ/],
  ["بینایی‌سنجی", /بیناییسنج|اپتومتر/],
  ["مامایی", /مامایی/],
  ["زنان و زایمان", /زنان|زایمان|نازایی|ناباروری/],
  ["طب سنتی", /طبسنتی|طبایرانی/],
  ["طب درد", /فلوشیپدرد|طبدرد/],
  ["بیهوشی", /بیهوشی/],
  ["طب ورزشی", /طبورزشی/],
  ["قلب و عروق", /قلب/],
  ["تغذیه", /تغذیه/],
  ["پوست و مو", /پوست/],
  ["کودکان", /کودکان|اطفال|نوزاد/],
  ["ارتوپدی", /ارتوپد/],
  ["چشم", /چشم/],
  ["گوش، حلق و بینی", /گوش|حلق|بینی/],
  ["دندانپزشکی", /دندان/],
  ["کلیه و مجاری ادرار", /اورولوژ|مجاریادرار/],
  ["غدد و متابولیسم", /غدد|متابولیسم|دیابت/],
  ["گوارش", /گوارش/],
  ["ریه", /ریه/],
  ["روماتولوژی", /روماتولوژ/],
  ["عفونی", /عفونی/],
  ["رادیولوژی و سونوگرافی", /رادیولوژ|سونوگراف/],
  ["طب اورژانس", /اورژانس/],
  ["جراحی", /جراح/],
  ["داخلی", /داخلی/],
  ["پزشک عمومی", /عمومی/],
];
const FIELD_NAMES = new Set(FIELDS.map(([n]) => n));
const DEGREE = /^(فوق)?(تخصص|متخصص)|^(دکترای?|کارشناسی?(ارشد)?|کارشناس(ارشد)?|دکترا)/;

function fieldOf(specialty) {
  if (!specialty) return null;
  const s = normalizeFa(specialty).replace(/ /g, "");
  for (const [name, re] of FIELDS) if (re.test(s)) return name;
  return s.replace(DEGREE, "").slice(0, 14) || null;
}

const nameKey = (d) => normalizeFa(d.name).replace(/^سید(ه)? /, "").replace(/ /g, "");
const cityKey = (d) => (firstCity(d) ? normalizeFa(firstCity(d)).replace(/ /g, "") : "");

/** Same person = same normalised name + same city + same field. Profiles missing city/field join the only matching group. */
function groupDoctors(doctors) {
  const groups = new Map();
  const complete = doctors.filter((d) => cityKey(d) && fieldOf(d.specialty));
  for (const d of complete) {
    const k = `${nameKey(d)}|${cityKey(d)}|${fieldOf(d.specialty)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  }
  for (const d of doctors.filter((x) => !complete.includes(x))) {
    const prefix = `${nameKey(d)}|${cityKey(d) || ""}`;
    const f = fieldOf(d.specialty);
    const same = [...groups.keys()].filter((k) => {
      const [n, c, fk] = k.split("|");
      return n === nameKey(d) && (!cityKey(d) || c === cityKey(d)) && (!f || fk === f);
    });
    const k = same.length === 1 ? same[0] : `${prefix}|${f || "?"}|${d.platform}${d.id}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  }
  return [...groups.values()].map((docs) => {
    const svc = docs.flatMap((d) => d.services.map((s) => ({ d, s })));
    const specs = uniq(docs.map((d) => d.specialty));
    return {
      docs,
      name: (docs.find((d) => /دکتر/.test(d.name)) || docs[0]).name.replace(/\s+/g, " ").trim(),
      city: uniq(docs.map(firstCity))[0] || null,
      field: fieldOf(specs[0]),
      specialty: specs.sort((a, b) => a.length - b.length)[0] || null,
      specialties: specs,
      platforms: uniq(docs.map((d) => d.platformName)),
      rows: svc,
      available: svc.filter((r) => r.s.firstFree),
      rated: docs.filter((d) => ratingLabel(d)).sort((a, b) => (b.ratingCount ?? 0) - (a.ratingCount ?? 0)),
    };
  });
}

// ---------------------------------------------------------------- sorting / filtering

/** Flatten doctors -> one row per (doctor, service). Doctors without online booking get a single row. */
export function toRows(doctors, { visitType = "all" } = {}) {
  const rows = [];
  for (const d of doctors) {
    const services = d.services.filter((s) => keepService(s, visitType));
    if (services.length) for (const s of services) rows.push({ d, s });
    else if (!d.services.length && visitType !== "online") rows.push({ d, s: null });
  }
  return rows;
}

const keepService = (s, visitType) =>
  visitType === "all" ? true : visitType === "in_person" ? s.type === "in_person" : isOnline(s.type);

const tKey = (r) => r.s?.firstFree?.getTime() ?? Infinity;
const pKey = (r) => r.s?.priceToman ?? Infinity;
const rKey = (r) => -(r.d.rating ?? -1) * 1000 - (r.d.ratingCount ?? 0) / 1e6;

function rowComparator(sort) {
  const keys = sort === "cheapest" ? [pKey, tKey] : sort === "rating" ? [rKey, tKey] : [tKey, pKey];
  // Rows with a free slot always come before rows without one.
  return (a, b) => (tKey(a) === Infinity) - (tKey(b) === Infinity) || keys[0](a) - keys[0](b) || keys[1](a) - keys[1](b);
}

// ---------------------------------------------------------------- report

const SORT_NAME = { cheapest: "ارزان‌ترین", rating: "بیشترین امتیاز", soonest: "زودترین نوبت" };

/** One-line description of a bookable option. */
const describe = (r) =>
  `**${r.d.name}** (${r.d.specialty || "—"}) در **${r.d.platformName}** — ${serviceLabel(r.s, r.d.city)}: **${whenLabel(r.s)}** · ${priceLabel(
    r.s
  )} — [رزرو](${r.s.bookingUrl || r.d.profileUrl})`;

export function buildReport({ query, city, doctors, platformStatus, visitType = "all", sort = "soonest", maxRows = 40 }) {
  const L = [];
  const failed = platformStatus.filter((p) => !p.ok);
  const vt = visitType === "in_person" ? " · فقط ویزیت حضوری" : visitType === "online" ? " · فقط مشاوره آنلاین" : "";

  L.push(`# نتیجه جستجوی پزشک: «${query}»${city ? ` در ${city}` : ""}`);
  L.push(
    `_زمان جستجو: ${formatFa(new Date(), { relative: false })} به وقت تهران · ${faDigits(platformStatus.length - failed.length)} از ${faDigits(
      platformStatus.length
    )} سایت نوبت‌دهی بررسی شد${vt}_`
  );
  if (failed.length) L.push("", `> ⚠️ ${failed.map((p) => p.name).join("، ")} پاسخ نداد؛ ممکن است نتایج آن سایت در این گزارش نباشد.`);
  L.push("");

  if (!doctors.length) {
    L.push("هیچ پزشکی با این نام پیدا نشد. پیشنهاد:");
    L.push("- املای نام را بررسی کنید.");
    L.push("- فقط نام خانوادگی را جستجو کنید.");
    if (city) L.push("- فیلتر شهر را بردارید؛ شاید مطب پزشک در شهر دیگری ثبت شده باشد.");
    L.push("", statusSection(platformStatus));
    return L.join("\n");
  }

  // ---- groups (one per real person), filtered by visit type
  const cmp = rowComparator(sort);
  const groups = groupDoctors(doctors).map((g) => {
    const rows = g.rows.filter((r) => keepService(r.s, visitType)).sort(cmp);
    return { ...g, rows, available: rows.filter((r) => r.s.firstFree) };
  });
  const withSlots = groups.filter((g) => g.available.length);
  const noSlots = groups.filter((g) => !g.available.length);
  const groupKey =
    sort === "cheapest"
      ? (g) => Math.min(...g.available.map(pKey))
      : sort === "rating"
      ? (g) => -(g.rated[0]?.rating ?? -1) * 1e6 - (g.rated[0]?.ratingCount ?? 0)
      : (g) => Math.min(...g.available.map(tKey));
  withSlots.sort((a, b) => groupKey(a) - groupKey(b) || Math.min(...a.available.map(tKey)) - Math.min(...b.available.map(tKey)));
  noSlots.sort((a, b) => b.docs.length - a.docs.length);

  const allAvail = withSlots.flatMap((g) => g.available);
  const soonestBy = (f) => allAvail.filter(f).sort((a, b) => a.s.firstFree - b.s.firstFree)[0];
  const cheapestBy = (f) => allAvail.filter((r) => r.s.priceToman != null && f(r)).sort((a, b) => a.s.priceToman - b.s.priceToman || a.s.firstFree - b.s.firstFree)[0];
  const soonestInPerson = soonestBy((r) => r.s.type === "in_person");
  const soonestOnline = soonestBy((r) => isOnline(r.s.type));
  const cheapestInPerson = cheapestBy((r) => r.s.type === "in_person");
  const cheapestOnline = cheapestBy((r) => isOnline(r.s.type));

  // ---- summary
  L.push("## خلاصه");
  if (groups.length > 1) {
    const fields = uniq(groups.map((g) => (FIELD_NAMES.has(g.field) ? g.field : short(g.specialty || "تخصص نامشخص", 25))));
    L.push(
      `- با این نام **${faDigits(groups.length)} پزشک مختلف** پیدا شد${fields.length > 1 ? ` (${fields.slice(0, 8).join("، ")})` : ""}. ` +
        "اگر تخصص پزشک خود را می‌دانید، فقط سراغ همان پزشک در فهرست زیر بروید."
    );
  } else {
    const g = groups[0];
    L.push(`- یک پزشک پیدا شد: **${g.name}** (${g.specialty || "—"}${g.city ? `، ${g.city}` : ""}) در ${g.platforms.join("، ")}.`);
  }
  L.push(
    withSlots.length
      ? `- **${faDigits(withSlots.length)}** پزشک الان نوبت خالی اینترنتی دارند${
          noSlots.length ? ` و **${faDigits(noSlots.length)}** پزشک ندارند (برای آن‌ها شماره مطب و لینک پروفایل در انتهای فهرست آمده)` : ""
        }.`
      : "- هیچ‌کدام از این پزشکان الان نوبت خالی اینترنتی ندارند؛ شماره مطب‌ها و لینک پروفایل‌ها در فهرست زیر آمده."
  );
  if (soonestInPerson) L.push(`- **زودترین نوبت حضوری:** ${whenLabel(soonestInPerson.s)} — ${soonestInPerson.d.name} در ${soonestInPerson.d.platformName}`);
  if (soonestOnline) L.push(`- **زودترین مشاوره آنلاین:** ${whenLabel(soonestOnline.s)} — ${soonestOnline.d.name} در ${soonestOnline.d.platformName}`);
  L.push("");

  // ---- 1. per-doctor blocks
  L.push(`## ۱) پزشکان و نوبت‌های خالی (مرتب‌سازی: ${SORT_NAME[sort] || SORT_NAME.soonest})`);
  L.push("");
  let shownRows = 0;
  withSlots.forEach((g, i) => {
    if (shownRows >= maxRows) return;
    L.push(`### ${faDigits(i + 1)}. ${g.name} — ${g.specialty || "تخصص نامشخص"}${g.city ? ` · ${g.city}` : ""}`);
    const meta = [];
    if (g.rated[0]) meta.push(`امتیاز: ${ratingLabel(g.rated[0])}${g.platforms.length > 1 ? ` در ${g.rated[0].platformName}` : ""}`);
    if (g.platforms.length > 1) meta.push(`در ${faDigits(g.platforms.length)} سایت: ${g.platforms.join("، ")}`);
    if (g.specialties.length > 1) meta.push(`عنوان تخصص در سایت‌ها: ${g.specialties.join(" / ")}`);
    const ins = uniq(g.docs.flatMap((d) => d.insurances || []));
    if (ins.length) meta.push(`بیمه: ${short(uniq(ins.map(insuranceFa)).join("، "), 80)}`);
    if (meta.length) L.push(meta.map((m) => `- ${m}`).join("\n"));
    L.push("");
    L.push("| سایت | نوع ویزیت / محل | اولین نوبت خالی | هزینه | لینک |");
    L.push("|---|---|---|---|---|");
    for (const r of g.rows) {
      if (shownRows++ >= maxRows) break;
      const when = r.s.firstFree ? `**${whenLabel(r.s)}**` : `✗ ${whenLabel(r.s)}`;
      L.push(
        `| ${cell(r.d.platformName)} | ${cell(serviceLabel(r.s, g.city))} | ${cell(when)} | ${cell(priceLabel(r.s))} | [${r.s.firstFree ? "رزرو" : "پروفایل"}](${
          r.s.bookingUrl || r.d.profileUrl
        }) |`
      );
    }
    const phones = phonesOf(g);
    if (phones) L.push("", `📞 تلفن مطب: ${phones}`);
    const notes = uniq(g.docs.flatMap((d) => d.notes || []).filter((n) => /بیعانه/.test(n)));
    if (notes.length) L.push("", `> ${notes.map(faDigits).join(" · ")}`);
    L.push("");
  });
  if (shownRows > maxRows) L.push(`_…ردیف‌های بیشتری هم هست؛ با فیلتر شهر یا نوع ویزیت نتیجه را محدودتر کنید._`, "");

  if (noSlots.length) {
    L.push(`### پزشکانی که الان نوبت خالی اینترنتی ندارند (${faDigits(noSlots.length)})`);
    L.push("نوبت‌ها معمولاً اول هفته یا اول ماه باز می‌شوند. چند روز بعد دوباره جستجو کنید یا با مطب تماس بگیرید.");
    L.push("");
    for (const g of noSlots.slice(0, 20)) {
      const links = g.docs.map((d) => `[${d.platformName}](${d.profileUrl})`);
      const office = officeOf(g);
      const phones = phonesOf(g);
      const rating = g.rated[0] ? ` · ${ratingLabel(g.rated[0])}` : "";
      L.push(
        `- **${g.name}** — ${g.specialty || "تخصص نامشخص"}${g.city ? ` · ${g.city}` : ""}${rating}\n  پروفایل: ${links.join("، ")}${office ? ` · محل: ${office}` : ""}${
          phones ? ` · 📞 ${phones}` : ""
        }`
      );
    }
    if (noSlots.length > 20) L.push(`- …و ${faDigits(noSlots.length - 20)} پزشک دیگر.`);
    L.push("");
  }
  L.push("> پزشکان هم‌نام ممکن است افراد متفاوتی باشند. پروفایل‌ها بر اساس نام، شهر و تخصص یکی شده‌اند؛ قبل از رزرو شماره نظام پزشکی را در پروفایل چک کنید.");
  L.push("");

  // ---- 2. best options (merged when one option wins several categories)
  const picks = [];
  const add = (adj, kind, r) => {
    if (!r) return;
    const hit = picks.find((p) => p.r === r);
    hit ? hit.adjs.push(adj) : picks.push({ r, kind, adjs: [adj] });
  };
  add("زودترین", "نوبت حضوری", soonestInPerson);
  add("ارزان‌ترین", "نوبت حضوری", cheapestInPerson);
  add("زودترین", "مشاوره آنلاین", soonestOnline);
  add("ارزان‌ترین", "مشاوره آنلاین", cheapestOnline);
  if (picks.length) {
    L.push("## ۲) بهترین گزینه‌ها");
    for (const p of picks) L.push(`- **${joinFa(p.adjs)} ${p.kind}:** ${describe(p.r)}`);
    const bestRated = groups
      .filter((g) => g.rated[0] && (g.rated[0].ratingCount ?? 0) >= 5)
      .sort((a, b) => b.rated[0].rating - a.rated[0].rating || (b.rated[0].ratingCount ?? 0) - (a.rated[0].ratingCount ?? 0))[0];
    if (bestRated && groups.length > 1)
      L.push(
        `- **بیشترین امتیاز کاربران:** **${bestRated.name}** (${bestRated.specialty || "—"}) — ${ratingLabel(bestRated.rated[0])} در ${bestRated.rated[0].platformName}${
          bestRated.available.length ? "" : " · فعلاً نوبت خالی ندارد"
        }`
      );
    L.push("");
  }

  // ---- 3. next steps
  L.push("## ۳) قدم بعدی");
  let n = 0;
  const step = (t) => L.push(`${faDigits(++n)}. ${t}`);
  if (groups.length > 1)
    step(
      city
        ? "**پزشک خودتان را پیدا کنید:** تخصص را با پزشکی که می‌خواهید مقایسه کنید."
        : "**پزشک خودتان را پیدا کنید:** تخصص را مقایسه کنید. اگر شهر پزشک را بگویید (مثلاً «تهران»)، فقط پزشکان همان شهر جستجو می‌شوند."
    );
  if (city) {
    const wanted = normalizeFa(city).replace(/ /g, "");
    const outside = groups.filter((g) => g.city && !normalizeFa(g.city).replace(/ /g, "").includes(wanted));
    if (outside.length)
      step(`${outside.length === 1 ? "یک پزشک در شهر دیگری است" : `${faDigits(outside.length)} پزشک در شهرهای دیگر هستند`} (${uniq(outside.map((g) => g.city)).slice(0, 4).join("، ")}). اگر پزشک شما مطب دوم دارد، آن‌ها را هم ببینید.`);
  }
  if (soonestInPerson)
    step(
      `**رزرو حضوری:** روی [لینک رزرو ${soonestInPerson.d.platformName}](${soonestInPerson.s.bookingUrl || soonestInPerson.d.profileUrl}) بزنید و نوبت **${whenLabel(
        soonestInPerson.s
      )}** را بگیرید.`
    );
  if (soonestOnline)
    step(
      `**اگر نمی‌توانید حضوری بروید:** ${VISIT[soonestOnline.s.type] || soonestOnline.s.label} با ${soonestOnline.d.name} در [${soonestOnline.d.platformName}](${
        soonestOnline.s.bookingUrl || soonestOnline.d.profileUrl
      }) از ${whenLabel(soonestOnline.s)}${soonestOnline.s.priceToman != null ? `، با هزینه ${faNum(soonestOnline.s.priceToman)} تومان` : ""}.`
    );
  const multi = withSlots.find((g) => new Set(g.docs.map((d) => d.platform)).size > 1);
  if (multi)
    step(
      `**اگر نوبتی که می‌خواهید پر بود:** ${multi.name} (${multi.specialty || "—"}) در ${joinFa(multi.platforms)} نوبت می‌دهد. هر سایت نوبت‌های جداگانه دارد، پس سایت دیگر را هم امتحان کنید.`
    );
  if (groups.some((g) => phonesOf(g))) step("**نوبت اینترنتی پیدا نکردید؟** با تلفن مطب (زیر هر پزشک) تماس بگیرید. گاهی نوبت تلفنی یا نوبت لغوشده هست.");
  step("**قبل از پرداخت:** پوشش بیمه و قوانین لغو نوبت و برگشت پول را در صفحه رزرو بخوانید و پیامک تأیید نوبت را نگه دارید.");
  step("**اورژانس:** منتظر نوبت نمانید. با **۱۱۵** تماس بگیرید یا به اورژانس نزدیک‌ترین بیمارستان بروید.");
  L.push("");

  L.push(statusSection(platformStatus));
  L.push("");
  L.push(
    "_قیمت‌ها و زمان‌ها همین الان از سایت‌ها خوانده شده و ممکن است تا زمان رزرو تغییر کنند. همه قیمت‌ها به تومان است. در نوبت دات آی آر فقط روز و ساعت کاری مطب مشخص است، نه ساعت دقیق نوبت._"
  );
  return L.join("\n");
}

const phoneList = (g) => uniq(g.docs.flatMap((d) => d.services.filter((s) => s.type === "in_person").flatMap((s) => s.phones || [])));
const phonesOf = (g) => phoneList(g).slice(0, 3).join(" ، ");

const INSURANCE_FA = {
  salamat: "بیمه سلامت", tamin: "تأمین اجتماعی", taamin: "تأمین اجتماعی", "tamin-ejtemaei": "تأمین اجتماعی",
  artesh: "نیروهای مسلح", "niroo-mosallah": "نیروهای مسلح", khadamat: "خدمات درمانی",
};
const insuranceFa = (x) => INSURANCE_FA[String(x).trim().toLowerCase()] || x;

const joinFa = (a) => (a.length < 2 ? a[0] : `${a.slice(0, -1).join("، ")} و ${a[a.length - 1]}`);

function statusSection(platformStatus) {
  const ok = platformStatus.filter((p) => p.ok);
  const failed = platformStatus.filter((p) => !p.ok);
  const L = ["## سایت‌های بررسی‌شده"];
  if (ok.length) L.push(`✓ ${ok.map((p) => `[${p.name}](${p.site}) (${faDigits(p.count ?? 0)} پزشک)`).join(" · ")}`);
  for (const p of failed) L.push(`✗ [${p.name}](${p.site}): پاسخ نداد (${cell(p.error)})`);
  return L.join("\n\n");
}

// ---------------------------------------------------------------- structured model (for the HTML page)

function optionModel(d, s, city) {
  const payAtClinic = s.priceToman == null && /در مطب/.test(s.priceNote || "");
  return {
    platform: d.platform,
    platformName: d.platformName,
    type: s.type,
    online: isOnline(s.type),
    typeLabel: VISIT[s.type] || s.label || "—",
    where: whereOf(s, city, 90) || null,
    address: s.address ? faDigits(s.address) : null,
    firstFree: s.firstFree ? s.firstFree.toISOString() : null,
    dayOnly: !!s.firstFreeIsDayOnly,
    hours: s.firstFree && s.firstFreeIsDayOnly && s.firstFreeLabel ? faDigits(s.firstFreeLabel) : null,
    unavailable: s.firstFree ? null : short(s.firstFreeLabel || "نوبت خالی ندارد", 70),
    priceToman: s.priceToman ?? null,
    priceMain: s.priceToman != null ? `${faNum(s.priceToman)} تومان` : payAtClinic ? "رزرو رایگان" : s.priceNote ? faDigits(s.priceNote) : "قیمت اعلام نشده",
    priceSub: s.priceToman != null ? s.priceNote || null : payAtClinic ? "ویزیت در مطب پرداخت می‌شود" : null,
    url: s.bookingUrl || d.profileUrl,
  };
}

/** Everything the HTML page needs: one entry per real doctor (same grouping as the Markdown report). */
export function buildModel({ query, city, doctors, platformStatus }) {
  const groups = groupDoctors(doctors).map((g, i) => {
    const r = g.rated[0];
    return {
      id: i + 1,
      name: g.name,
      specialty: g.specialty,
      specialties: g.specialties,
      field: FIELD_NAMES.has(g.field) ? g.field : short(g.specialty || "تخصص نامشخص", 25),
      city: g.city,
      platforms: uniq(g.docs.map((d) => d.platform)),
      rating: r ? { value: Number(r.rating), count: r.ratingCount ?? 0, satisfaction: r.satisfaction ?? null, platformName: r.platformName } : null,
      insurances: uniq(g.docs.flatMap((d) => d.insurances || []).map(insuranceFa)),
      phones: phoneList(g),
      profiles: g.docs.map((d) => ({ platform: d.platform, platformName: d.platformName, url: d.profileUrl })),
      office: officeOf(g, 90),
      notes: uniq(g.docs.flatMap((d) => d.notes || []).filter((n) => /بیعانه/.test(n))).map(faDigits),
      options: g.rows.map(({ d, s }) => optionModel(d, s, g.city)),
    };
  });
  return {
    query,
    city: city || null,
    generatedAt: new Date().toISOString(),
    platforms: platformStatus.map((p) => ({ id: p.id, name: p.name, site: p.site, ok: !!p.ok, count: p.count ?? 0, ms: p.ms ?? null, error: p.error || null })),
    groups,
  };
}

/** JSON-friendly version (Dates -> Tehran ISO strings). */
export function toJSON(doctors) {
  return doctors.map((d) => ({
    ...d,
    services: d.services.map((s) => ({
      ...s,
      firstFree: toTehranISO(s.firstFree),
      firstFreeText: whenLabel(s),
      openDays: s.openDays?.map((o) => ({ date: toTehranISO(o.date), hours: o.hours })),
    })),
  }));
}
