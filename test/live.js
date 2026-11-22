// Usage: node test/live.js "نام پزشک" [شهر]
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const server = fileURLToPath(new URL("../src/index.js", import.meta.url));
const client = new Client({ name: "smoke", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [server] }));

const { tools } = await client.listTools();
console.log("TOOLS:", tools.map((t) => t.name).join(", "));

const name = process.argv[2] || "";
const city = process.argv[3];
const t = Date.now();
const r = await client.callTool({ name: "search_doctor", arguments: { name, city, max_per_platform: 3, include_json: true } });
const out = r.content[0].text;
console.log(out.split("```json")[0]);
console.log(`\n[search_doctor took ${((Date.now() - t) / 1000).toFixed(1)}s]`);

const json = JSON.parse(out.split("```json\n")[1].split("\n```")[0]);
const pick = json.find((d) => d.services.length) || json[0];
if (pick) {
  const d = await client.callTool({ name: "get_doctor_details", arguments: { platform: pick.platform, id: pick.id } });
  console.log("\n--- get_doctor_details", pick.platform, pick.id, "\n", d.content[0].text);
}
const lp = await client.callTool({ name: "list_platforms", arguments: {} });
console.log("\n--- list_platforms\n", lp.content[0].text);
await client.close();
