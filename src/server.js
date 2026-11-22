// MCP server definition: tools search_doctor, get_doctor_details, list_platforms.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PROVIDERS, IDS, EXCLUDED, searchAll } from "./search.js";
import { buildReport, buildModel, toJSON } from "./report.js";
import { saveHtml } from "./html.js";
import { formatFa, VISIT, faNum, faDigits } from "./util.js";
import { config } from "./config.js";
import { log } from "./log.js";

export const VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

const text = (t) => ({ type: "text", text: t });
const cell = (s) => String(s ?? "—").replace(/\|/g, "／").replace(/\n/g, " ").trim() || "—";

function detailsMarkdown(d) {
  const L = [`# ${d.name || "پزشک"} — ${d.platformName}`, ""];
  L.push(`- تخصص: ${d.specialty || "—"} · شهر: ${d.city || "—"}`);
  if (d.rating || d.ratingCount)
    L.push(`- امتیاز: ⭐ ${d.rating != null ? faDigits(Number(d.rating).toFixed(1)).replace(".", "٫") : "—"} از ۵ (${faNum(d.ratingCount ?? 0)} نظر)`);
  if (d.insurances?.length) L.push(`- بیمه: ${d.insurances.join("، ")}`);
  L.push(`- پروفایل: ${d.profileUrl}`, "");
  L.push("| نوع ویزیت | عنوان | اولین نوبت خالی | هزینه (تومان) | مرکز/مطب | آدرس | تلفن |", "|---|---|---|---|---|---|---|");
  for (const s of d.services) {
    const when = s.firstFree
      ? formatFa(s.firstFree, { withTime: !s.firstFreeIsDayOnly }) + (s.firstFreeIsDayOnly && s.firstFreeLabel ? ` — ${faDigits(s.firstFreeLabel)}` : "")
      : s.firstFreeLabel || "—";
    const price = s.priceToman != null ? faNum(s.priceToman) : s.priceNote || "—";
    L.push(`| ${[VISIT[s.type] || s.type, s.label, when, price, s.center, s.address, [...new Set(s.phones || [])].join("، ")].map(cell).join(" | ")} |`);
    if (s.openDays?.length > 1)
      L.push(`| | روزهای باز بعدی | ${cell(s.openDays.map((o) => formatFa(o.date, { withTime: false }) + (o.hours ? ` (${faDigits(o.hours)})` : "")).join("، "))} | | | | |`);
  }
  if (!d.services.length) L.push("| — | نوبت اینترنتی فعال نیست | — | — | — | — | — |");
  for (const n of d.notes || []) L.push(`\n> ${n}`);
  return L.join("\n");
}

export function createServer() {
  const server = new McpServer({ name: "iran-doctor", version: VERSION });

  server.registerTool(
    "search_doctor",
    {
      title: "جستجوی پزشک در اپ‌های نوبت‌دهی ایران",
      description:
        "Search a doctor BY NAME across the 5 Iranian booking platforms that support name search + free appointment + price " +
        "(Paziresh24 پذیرش۲۴, Doctoreto دکترتو, Nobat.ir نوبت, DrNext دکترنکست, Darmankade درمانکده). " +
        "Returns a Persian report: summary, one block per doctor (profiles of the same person on different sites are merged) with " +
        "first free time, price in Toman and booking links, best options, next steps and platform status. " +
        "Also saves an interactive HTML page and returns its path: give that path to the user. " +
        "Use Persian names (e.g. «مریم احمدی»); last name alone also works. ALWAYS pass city when the user mentions one: " +
        "each platform is then searched inside that city, so local doctors are not crowded out.",
      inputSchema: {
        name: z.string().trim().min(2).max(100).describe("Doctor name in Persian, e.g. 'دکتر مریم احمدی' or 'احمدی'"),
        city: z.string().trim().max(50).optional().describe("City in Persian (e.g. 'تهران', 'اصفهان', 'مشهد'). Platforms are searched within this city."),
        platforms: z.array(z.enum(IDS)).max(IDS.length).optional().describe(`Subset of platforms (default all): ${IDS.join(", ")}`),
        max_per_platform: z.number().int().min(1).max(10).default(5).describe("Max matching doctors to open per platform (default 5)"),
        visit_type: z.enum(["all", "in_person", "online"]).default("all").describe("Filter visit type"),
        sort: z.enum(["soonest", "cheapest", "rating"]).default("soonest").describe("Sort order"),
        include_json: z.boolean().default(false).describe("Also append raw structured JSON of all results"),
        html: z.boolean().optional().describe("Save an interactive HTML page of the results (default: on, see DOCTOR_MCP_HTML)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ name, city, platforms, max_per_platform, visit_type, sort, include_json, html }) => {
      const { doctors, platformStatus } = await searchAll(name, {
        city: city || undefined,
        platforms: platforms?.length ? [...new Set(platforms)] : IDS,
        limit: max_per_platform,
      });
      let out = buildReport({ query: name, city, doctors, platformStatus, visitType: visit_type, sort });
      const content = [];
      if (html ?? config.htmlDefault) {
        try {
          const file = saveHtml(buildModel({ query: name, city, doctors, platformStatus }));
          const lines = out.split("\n");
          lines.splice(2, 0, "", `📄 **نسخه تعاملی (HTML) این گزارش:** \`${file}\` — در مرورگر باز کنید (فیلتر تخصص/سایت/نوع ویزیت، مرتب‌سازی، دکمه رزرو).`);
          out = lines.join("\n");
          content.push({ type: "resource_link", uri: pathToFileURL(file).href, name: "doctor-report.html", title: `گزارش HTML: ${name}`, mimeType: "text/html" });
        } catch (e) {
          log.error("html report failed", { error: e.message });
          out += `\n\n_ساخت فایل HTML ناموفق بود: ${e.message}_`;
        }
      }
      if (include_json) out += "\n\n```json\n" + JSON.stringify(toJSON(doctors), null, 1) + "\n```";
      const allFailed = platformStatus.length > 0 && platformStatus.every((p) => !p.ok);
      return { content: [text(out), ...content], ...(allFailed ? { isError: true } : {}) };
    }
  );

  server.registerTool(
    "get_doctor_details",
    {
      title: "جزئیات یک پزشک در یک پلتفرم",
      description:
        "Full details for ONE doctor on ONE platform: every visit type with price, first free time, clinic address & phones " +
        "(and open days for nobat.ir). The `id` is the one shown in search_doctor JSON or the profile URL itself: " +
        "paziresh24 = slug (دکتر-مریم-احمدی-5), doctoreto = 'slug/code' (dr-mehran-ahmadi/GxbEdZ), nobat = page slug or URL, " +
        "drnext = doctor id (zvOqzwrOZ4BZ), darmankade = numeric id (423925). A full profile URL of that platform is accepted.",
      inputSchema: {
        platform: z.enum(IDS),
        id: z.string().trim().min(1).max(300).describe("Doctor id/slug or profile URL"),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ platform, id }) => {
      try {
        return { content: [text(detailsMarkdown(await PROVIDERS[platform].details(id)))] };
      } catch (e) {
        log.warn("details failed", { platform, error: e.message });
        return { content: [text(`خطا در دریافت اطلاعات از ${PROVIDERS[platform].info.name}: ${e.message}`)], isError: true };
      }
    }
  );

  server.registerTool(
    "list_platforms",
    {
      title: "فهرست پلتفرم‌های نوبت‌دهی",
      description: "List the supported Iranian doctor booking platforms, what each provides, and which sites were checked but excluded (and why).",
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const L = ["## پلتفرم‌های پشتیبانی‌شده (جستجو با نام + نوبت خالی + قیمت)", "", "| پلتفرم | سایت | اپ | توضیح |", "|---|---|---|---|"];
      for (const p of Object.values(PROVIDERS)) L.push(`| ${p.info.name} | ${p.info.site} | ${p.info.app} | ${p.info.notes} |`);
      L.push("", "## بررسی‌شده ولی اضافه نشده", "", "| سایت/اپ | دلیل |", "|---|---|");
      for (const [n, r] of EXCLUDED) L.push(`| ${n} | ${r} |`);
      return { content: [text(L.join("\n"))] };
    }
  );

  return server;
}
