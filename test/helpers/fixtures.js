// Synthetic doctors (not real people) in the shape providers return. Times are relative to "now".
const H = 3600e3;
const at = (hours) => new Date(Date.now() + hours * H);

const svc = (o) => ({
  type: "in_person",
  label: "ویزیت",
  priceToman: null,
  priceNote: null,
  firstFree: null,
  firstFreeLabel: null,
  firstFreeIsDayOnly: false,
  center: null,
  address: null,
  phones: [],
  bookingUrl: null,
  ...o,
});

const doc = (o) => ({
  id: "x",
  name: "",
  specialty: null,
  city: null,
  rating: null,
  ratingCount: null,
  satisfaction: null,
  insurances: [],
  services: [],
  notes: [],
  ...o,
  profileUrl: o.profileUrl || `https://example.test/${o.platform}/${o.id}`,
});

export function doctors() {
  return [
    // A — same person on two sites, specialty written two different ways -> must be merged
    doc({
      platform: "paziresh24", platformName: "پذیرش۲۴", id: "sara-1", name: "دکتر سارا رضایی", specialty: "کارشناس ارشد کاردرمانی",
      city: "تهران", rating: 4.9, ratingCount: 40, satisfaction: 97, insurances: ["salamat"],
      services: [
        svc({ priceToman: 50000, priceNote: "پرداخت هنگام رزرو", firstFree: at(2), center: "مطب سارا رضایی", address: "تهران، تهران،قیطریه",
          phones: ["02100000001", "02100000001"], bookingUrl: "https://www.paziresh24.com/dr/sara-1/" }),
      ],
    }),
    doc({
      platform: "doctoreto", platformName: "دکترتو", id: "sara/AbC", name: "سارا رضایی", specialty: "کارشناسی ارشد کار درمانی", city: "تهران",
      services: [
        svc({ type: "online_phone", label: "مشاوره تلفنی", priceToman: 100000, firstFree: at(26), center: "آنلاین", bookingUrl: "https://doctoreto.com/doctor/sara/AbC" }),
        svc({ priceNote: "رزرو رایگان؛ حق ویزیت در مطب", firstFree: at(75), center: "مطب ونک", address: "ونک", phones: ["02100000002"],
          bookingUrl: "https://doctoreto.com/doctor/sara/AbC" }),
      ],
    }),
    // B — same name + city but a different field (cardiology) and no online booking -> separate person
    doc({
      platform: "drnext", platformName: "دکترنکست", id: "zz1", name: "سارا رضایی", specialty: "متخصص قلب و عروق", city: "تهران",
      rating: 0, ratingCount: 0, notes: ["نوبت آنلاین فعال نیست. مطب: بیمارستان نمونه، تهران، خیابان آزمایش"],
    }),
    // C — midwife, office exists but no free slot
    doc({
      platform: "doctoreto", platformName: "دکترتو", id: "sara2/Q", name: "سارا رضایی", specialty: "کارشناسی مامایی", city: "تهران",
      services: [svc({ priceNote: "رزرو رایگان؛ حق ویزیت در مطب", firstFreeLabel: "در حال حاضر نوبتی برای این مطب تعریف نشده است.",
        center: "کلینیک نمونه", phones: ["02100000003"], bookingUrl: "https://doctoreto.com/doctor/sara2/Q" })],
    }),
    // D — other city, day-only slot (nobat style)
    doc({
      platform: "nobat", platformName: "نوبت دات آی آر", id: "999", name: "دکتر سارا رضایی", specialty: "متخصص زنان و زایمان", city: "شیراز",
      rating: 4.5, ratingCount: 12,
      services: [svc({ label: "نوبت حضوری مطب", priceNote: "نوبت بدون کارمزد؛ حق ویزیت در مطب", firstFree: at(30), firstFreeIsDayOnly: true,
        firstFreeLabel: "ساعت کاری 08:00 تا 12:00", center: "مطب شیراز", phones: ["07100000004"], bookingUrl: "https://nobat.ir/999" })],
    }),
  ];
}

export const okStatus = (over = {}) => [
  { id: "paziresh24", name: "پذیرش۲۴", site: "https://www.paziresh24.com", ok: true, count: 1, ms: 900 },
  { id: "doctoreto", name: "دکترتو", site: "https://doctoreto.com", ok: true, count: 2, ms: 1500 },
  { id: "nobat", name: "نوبت دات آی آر", site: "https://nobat.ir", ok: true, count: 1, ms: 700 },
  { id: "drnext", name: "دکترنکست", site: "https://drnext.ir", ok: true, count: 1, ms: 800 },
  { id: "darmankade", name: "درمانکده", site: "https://www.darmankade.com", ok: true, count: 0, ms: 600, ...over },
];
