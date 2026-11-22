import "../helpers/env.js";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, VERSION } from "../../src/server.js";

let client;
let server;

before(async () => {
  server = createServer();
  client = new Client({ name: "unit", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
});
after(async () => {
  await client?.close();
  await server?.close();
});

test("server reports name and package version", () => {
  assert.deepEqual(client.getServerVersion(), { name: "iran-doctor", version: VERSION });
});

test("lists the three tools with annotations and input limits", async () => {
  const { tools } = await client.listTools();
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
  assert.deepEqual(Object.keys(byName).sort(), ["get_doctor_details", "list_platforms", "search_doctor"]);
  assert.equal(byName.get_doctor_details.annotations.readOnlyHint, true);
  assert.equal(byName.search_doctor.annotations.openWorldHint, true);
  const name = byName.search_doctor.inputSchema.properties.name;
  assert.equal(name.minLength, 2);
  assert.equal(name.maxLength, 100);
  assert.deepEqual(byName.search_doctor.inputSchema.required, ["name"]);
});

test("list_platforms works offline", async () => {
  const r = await client.callTool({ name: "list_platforms", arguments: {} });
  assert.match(r.content[0].text, /پذیرش۲۴/);
  assert.match(r.content[0].text, /بررسی‌شده ولی اضافه نشده/);
});

test("get_doctor_details refuses foreign URLs (no SSRF)", async () => {
  const r = await client.callTool({ name: "get_doctor_details", arguments: { platform: "nobat", id: "https://evil.example/x" } });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /Nobat id must be/);
});

test("invalid input is rejected", async () => {
  const r = await client.callTool({ name: "search_doctor", arguments: { name: "a" } }).catch((e) => ({ isError: true, content: [{ text: e.message }] }));
  assert.equal(r.isError, true);
});
