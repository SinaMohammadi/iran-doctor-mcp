import "../helpers/env.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReport, buildModel, toJSON } from "../../src/report.js";
import { doctors, okStatus } from "../helpers/fixtures.js";

const model = () => buildModel({ query: "سارا رضایی", city: "تهران", doctors: doctors(), platformStatus: okStatus() });
const report = (o = {}) => buildReport({ query: "سارا رضایی", city: "تهران", doctors: doctors(), platformStatus: okStatus(), ...o });

test("groups the same person across sites, keeps different fields apart", () => {
  const m = model();
  assert.equal(m.groups.length, 4);
  const ot = m.groups.find((g) => g.field === "کاردرمانی");
  assert.deepEqual(ot.platforms.sort(), ["doctoreto", "paziresh24"]);
  assert.equal(ot.options.length, 3);
  assert.ok(m.groups.find((g) => g.field === "قلب و عروق"), "cardiologist is a separate doctor");
  assert.ok(m.groups.find((g) => g.field === "مامایی"), "midwife is a separate doctor");
  assert.ok(m.groups.find((g) => g.city === "شیراز"), "other city is a separate doctor");
});

test("model: prices, ratings, phones, insurance", () => {
  const ot = model().groups.find((g) => g.field === "کاردرمانی");
  assert.deepEqual(ot.phones, ["02100000001", "02100000002"]);
  assert.deepEqual(ot.insurances, ["بیمه سلامت"]);
  assert.equal(ot.rating.value, 4.9);
  const free = ot.options.find((o) => o.platform === "doctoreto" && !o.online);
  assert.equal(free.priceMain, "رزرو رایگان");
  assert.equal(free.priceSub, "ویزیت در مطب پرداخت می‌شود");
  const paid = ot.options.find((o) => o.platform === "paziresh24");
  assert.equal(paid.priceMain, "۵۰٬۰۰۰ تومان");
  assert.ok(!Number.isNaN(Date.parse(paid.firstFree)));
  const cardio = model().groups.find((g) => g.field === "قلب و عروق");
  assert.equal(cardio.rating, null, "0 rating with 0 reviews means no rating");
  assert.match(cardio.office, /بیمارستان نمونه/);
});

test("report: summary, blocks, merged best options, next steps", () => {
  const r = report();
  assert.match(r, /^# نتیجه جستجوی پزشک: «سارا رضایی» در تهران/);
  assert.match(r, /\*\*۴ پزشک مختلف\*\*/);
  assert.match(r, /## خلاصه/);
  assert.match(r, /زودترین و ارزان‌ترین نوبت حضوری/);
  assert.match(r, /زودترین و ارزان‌ترین مشاوره آنلاین/);
  assert.match(r, /یک پزشک در شهر دیگری است \(شیراز\)/);
  assert.match(r, /پزشکانی که الان نوبت خالی اینترنتی ندارند \(۲\)/);
  assert.match(r, /\*\*اورژانس:\*\*.*۱۱۵/);
  assert.doesNotMatch(r, /0\.0\/5|۰٫۰ از ۵/, "no fake zero ratings");
  assert.doesNotMatch(r, /undefined|null|NaN/);
});

test("report: visit_type=online hides in-person rows", () => {
  const r = report({ visitType: "online" });
  assert.match(r, /فقط مشاوره آنلاین/);
  assert.doesNotMatch(r, /\| پذیرش۲۴ \| حضوری/);
  assert.match(r, /\| دکترتو \| مشاوره تلفنی/);
});

test("report: no results and failed platforms", () => {
  const r = buildReport({ query: "ناموجود", city: "تهران", doctors: [], platformStatus: okStatus({ ok: false, error: "timeout" }) });
  assert.match(r, /هیچ پزشکی با این نام پیدا نشد/);
  assert.match(r, /⚠️ درمانکده پاسخ نداد/);
  assert.match(r, /✗ \[درمانکده\]\(https:\/\/www\.darmankade\.com\): پاسخ نداد \(timeout\)/);
});

test("report: every sort order renders", () => {
  for (const sort of ["soonest", "cheapest", "rating"]) assert.match(report({ sort }), /## ۱\) پزشکان و نوبت‌های خالی/);
});

test("toJSON: dates become Tehran ISO strings", () => {
  const j = toJSON(doctors());
  const s = j[0].services[0];
  assert.match(s.firstFree, /^\d{4}-\d\d-\d\dT\d\d:\d\d:00\+03:30$/);
  assert.equal(typeof s.firstFreeText, "string");
});
