import "../helpers/env.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gregorianToJalali, jalaliToGregorian, faDigits, faNum, normalizeFa, nameMatches, cityMatches, citySlug, formatFa,
  parseTehranLocal, toTehranISO, isAllowedUrl, http,
} from "../../src/util.js";

test("Jalali: known date and Nowruz", () => {
  assert.deepEqual(gregorianToJalali(2026, 11, 18), [1405, 8, 27]);
  assert.deepEqual(jalaliToGregorian(1405, 8, 27), [2026, 11, 18]);
  assert.deepEqual(gregorianToJalali(2025, 3, 21), [1404, 1, 1]);
});

test("Jalali: round-trips every day 2015-2035", () => {
  for (let t = Date.UTC(2015, 0, 1); t <= Date.UTC(2035, 11, 31); t += 86400e3) {
    const d = new Date(t);
    const g = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
    assert.deepEqual(jalaliToGregorian(...gregorianToJalali(...g)), g, `round-trip failed for ${g.join("-")}`);
  }
});

test("Persian digits and numbers", () => {
  assert.equal(faDigits("12:05"), "۱۲:۰۵");
  assert.equal(faDigits(null), "");
  assert.equal(faNum(150000), "۱۵۰٬۰۰۰");
  assert.equal(faNum(null), null);
});

test("normalizeFa: Arabic letters, ZWNJ, titles, digits", () => {
  assert.equal(normalizeFa("دكتر علي‌رضا"), "علی رضا");
  assert.equal(normalizeFa("Dr. ۱۲"), "12");
});

test("nameMatches / cityMatches", () => {
  assert.ok(nameMatches("مریم احمدی", "دکتر مریم سادات احمدی"));
  assert.ok(nameMatches("احمدي", "دکتر احمدی"));
  assert.ok(!nameMatches("رضایی", "مریم احمدی"));
  assert.ok(!nameMatches("", "مریم احمدی"));
  assert.ok(cityMatches("تهران", "تهران، قیطریه"));
  assert.ok(cityMatches(undefined, "anything"));
  assert.ok(!cityMatches("شیراز", "تهران"));
});

test("citySlug", () => {
  assert.equal(citySlug("تهران", "paziresh24"), "tehran");
  assert.equal(citySlug("بوشهر", "doctoreto"), "boshehr");
  assert.equal(citySlug("tabriz", "paziresh24"), "tabriz");
  assert.equal(citySlug("ناشناخته", "paziresh24"), null);
});

test("Tehran time helpers", () => {
  const d = parseTehranLocal("2026-11-18 14:30");
  assert.equal(d.toISOString(), "2026-11-18T11:00:00.000Z");
  assert.equal(toTehranISO(d), "2026-11-18T14:30:00+03:30");
  assert.match(formatFa(new Date()), /\(امروز\)$/);
  assert.match(formatFa(d, { relative: false }), /^.+ ۲۷ آبان، ساعت ۱۴:۳۰$/);
});

test("isAllowedUrl: only the booking sites", () => {
  for (const ok of ["https://www.paziresh24.com/dr/x/", "https://apigw.paziresh24.com/a", "http://nobat.ir/1", "https://cyclops.drnext.ir/v1"]) {
    assert.ok(isAllowedUrl(ok), ok);
  }
  for (const bad of [
    "https://evil.com", "https://paziresh24.com.evil.com/", "https://evilpaziresh24.com", "file:///etc/passwd",
    "https://user:pw@nobat.ir/", "http://127.0.0.1:8080/", "javascript:alert(1)", "not a url", "",
  ]) {
    assert.ok(!isAllowedUrl(bad), bad);
  }
});

test("http refuses non-allowed hosts without touching the network", async () => {
  await assert.rejects(http("https://example.com/"), /blocked URL/);
  await assert.rejects(http("http://169.254.169.254/latest/meta-data"), /blocked URL/);
});
