import "../helpers/env.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { PROVIDERS, searchAll, clearCache } from "../../src/search.js";

const info = (id) => ({ id, name: id, site: `https://${id}.test`, app: "", notes: "" });
let calls = 0;

PROVIDERS.fake_ok = {
  info: info("fake_ok"),
  async search(name, { city, limit }) {
    calls++;
    assert.equal(name, "مریم احمدی", "name is trimmed and spaces collapsed");
    assert.equal(city, "تهران");
    assert.equal(limit, 3);
    const s = { type: "in_person", center: "a", address: "b", priceToman: 1, firstFree: new Date(1e12), phones: ["1", "1", "2"] };
    return [{ platform: "fake_ok", platformName: "fake_ok", id: "1", name: "مریم احمدی", services: [s, { ...s }], notes: [] }];
  },
};
PROVIDERS.fake_slow = { info: info("fake_slow"), search: () => new Promise((r) => setTimeout(() => r([]), 5000).unref()) };
PROVIDERS.fake_err = {
  info: info("fake_err"),
  async search() {
    throw new Error("boom", { cause: { code: "ENOTFOUND" } });
  },
};

test("one slow or failing site never breaks the search", async () => {
  clearCache();
  const t = Date.now();
  const r = await searchAll("  مریم   احمدی ", { city: " تهران ", platforms: ["fake_ok", "fake_slow", "fake_err", "nope"], limit: 3 });
  assert.ok(Date.now() - t < 3000, "deadline cut the slow site");
  const st = Object.fromEntries(r.platformStatus.map((s) => [s.id, s]));
  assert.equal(st.fake_ok.ok, true);
  assert.equal(st.fake_slow.ok, false);
  assert.match(st.fake_slow.error, /no answer within/);
  assert.equal(st.fake_err.error, "ENOTFOUND");
  assert.equal(st.nope.error, "unknown platform");
  assert.equal(r.doctors.length, 1);
  assert.equal(r.doctors[0].services.length, 1, "duplicate service removed");
  assert.deepEqual(r.doctors[0].services[0].phones, ["1", "2"], "duplicate phone removed");
});

test("identical searches are served from cache (as independent copies)", async () => {
  clearCache();
  calls = 0;
  const a = await searchAll("مریم احمدی", { city: "تهران", platforms: ["fake_ok"], limit: 3 });
  a.doctors[0].name = "mutated";
  const b = await searchAll("مريم احمدي", { city: "تهران", platforms: ["fake_ok"], limit: 3 }); // Arabic ي: same normalised key
  assert.equal(calls, 1);
  assert.equal(b.platformStatus[0].cached, true);
  assert.equal(b.doctors[0].name, "مریم احمدی");
  assert.ok(b.doctors[0].services[0].firstFree instanceof Date);
});
