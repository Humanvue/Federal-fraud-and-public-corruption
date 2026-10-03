/**
 * Fetch a government or court web page, store its text, archive it on the
 * Wayback Machine, and write a source YAML file (SPEC.md §4.5, §7.1 step 2).
 *
 *   npm run source -- --url https://www.justice.gov/... --id src-doj-20190211-01 \
 *       --publisher "U.S. Department of Justice" [--type government|court] \
 *       [--org org-usao-edva] [--report OIG-19-12] [--out drafts]
 *
 * Writes <out>/sources/<id>.yaml and <out>/sources/text/<id>.md. Default out is
 * drafts/ (gitignored). Move the files into data/ after review.
 *
 * For a PDF, or a page whose text was already extracted, pass --text <file>
 * to use that file's contents instead of extracting from HTML; --title and
 * --date override what the page metadata says. The page is still fetched (to
 * confirm it exists) and archived.
 */
import fs from "node:fs";
import path from "node:path";
import { stringify } from "yaml";
import { ID_PATTERNS } from "../src/schemas/common";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const url = arg("url");
const id = arg("id");
const publisher = arg("publisher");
const type = arg("type", "government") as "government" | "court";
const orgId = arg("org") ?? null;
const report = arg("report") ?? null;
const out = arg("out", "drafts")!;
const textOverride = arg("text");
const titleOverride = arg("title");
const dateOverride = arg("date");
if (!url || !id || !publisher) {
  console.error("usage: --url <url> --id <src-id> --publisher <name> [--type government|court] [--org <org-id>] [--report <no>] [--out <dir>]");
  process.exit(2);
}
if (!ID_PATTERNS.source.test(id)) {
  console.error(`id ${id} does not match src-<publisher>-YYYYMMDD-NN`);
  process.exit(2);
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 corruption-tracker/0.1";

/**
 * justice.gov (Akamai) answers the first request with a small interstitial that
 * sets cookies and meta-refreshes after 5 seconds to the same path plus a
 * `bm-verify` token. Following that refresh with the cookies yields the page.
 */
async function fetchPage(target: string): Promise<{ status: number; html: string; finalUrl: string }> {
  const first = await fetch(target, { headers: { "user-agent": UA, accept: "text/html" }, redirect: "follow" });
  let html = await first.text();
  if (!/bm-verify/.test(html)) return { status: first.status, html, finalUrl: first.url };
  const refresh = /URL='([^']+)'/.exec(html)?.[1];
  if (!refresh) return { status: first.status, html, finalUrl: first.url };
  const cookies = (first.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const next = new URL(refresh, target).toString();
  await new Promise((r) => setTimeout(r, 5500));
  const second = await fetch(next, { headers: { "user-agent": UA, accept: "text/html", cookie: cookies }, redirect: "follow" });
  html = await second.text();
  return { status: second.status, html, finalUrl: second.url };
}

function decodeEntities(s: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", mdash: "—", ndash: "–", hellip: "…" };
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => named[n.toLowerCase()] ?? m);
}

/** Minimal HTML to text. Prefers <main> or <article>; drops nav, header, footer, scripts, styles. */
export function htmlToText(html: string): string {
  let h = html.replace(/<!--[\s\S]*?-->/g, "");
  for (const tag of ["script", "style", "noscript", "nav", "header", "footer", "aside", "form", "svg"]) {
    h = h.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, "gi"), " ");
  }
  const main = /<main\b[\s\S]*?<\/main>/i.exec(h)?.[0] ?? /<article\b[\s\S]*?<\/article>/i.exec(h)?.[0] ?? (/<body\b[\s\S]*?<\/body>/i.exec(h)?.[0] ?? h);
  let t = main
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|table|blockquote|section|ul|ol|dd|dt)>/gi, "\n")
    .replace(/<(h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ");
  t = decodeEntities(t)
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t;
}

function findTitle(html: string): string {
  const og = /<meta\s+property="og:title"\s+content="([^"]*)"/i.exec(html)?.[1];
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  const t = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const raw = og ?? h1 ?? t ?? "";
  return decodeEntities(raw.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").replace(/\s*\|.*$/, "").trim();
}

function findDate(html: string): string | null {
  const candidates = [
    /<meta\s+property="article:published_time"\s+content="([^"]+)"/i,
    /<meta\s+name="(?:date|dcterms\.date|citation_date|pubdate)"\s+content="([^"]+)"/i,
    /<time\b[^>]*datetime="([^"]+)"/i,
  ];
  for (const re of candidates) {
    const m = re.exec(html)?.[1];
    if (m) {
      const d = /^(\d{4}-\d{2}-\d{2})/.exec(m)?.[1];
      if (d) return d;
    }
  }
  const long = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/.exec(html);
  if (long) {
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${long[3]}-${String(months.indexOf(long[1]) + 1).padStart(2, "0")}-${long[2].padStart(2, "0")}`;
  }
  return null;
}

async function archive(target: string): Promise<{ url: string | null; status: "ok" | "failed" }> {
  try {
    const avail = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(target)}`, { headers: { "user-agent": UA } });
    const j = (await avail.json()) as { archived_snapshots?: { closest?: { url?: string; timestamp?: string } } };
    const closest = j.archived_snapshots?.closest;
    const recent = closest?.timestamp && Date.now() - Date.parse(closest.timestamp.replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, "$1-$2-$3T$4:$5:$6Z")) < 90 * 86400e3;
    if (closest?.url && recent) return { url: closest.url.replace(/^http:/, "https:"), status: "ok" };
  } catch {
    /* fall through to save */
  }
  try {
    const res = await fetch(`https://web.archive.org/save/${target}`, { headers: { "user-agent": UA }, redirect: "follow" });
    const loc = res.headers.get("content-location") ?? res.headers.get("location");
    if (loc) return { url: loc.startsWith("http") ? loc : `https://web.archive.org${loc}`, status: "ok" };
    if (res.ok && /\/web\/\d{14}\//.test(res.url)) return { url: res.url, status: "ok" };
  } catch {
    /* reported below */
  }
  return { url: null, status: "failed" };
}

const res = await fetchPage(url);
const isPdf = /\.pdf(\?|$)/i.test(url) || res.html.startsWith("%PDF");
if (res.status !== 200 || /bm-verify/.test(res.html)) {
  console.error(`fetch failed: HTTP ${res.status}${/bm-verify/.test(res.html) ? " (bot check not cleared; retry in a minute)" : ""}`);
  process.exit(1);
}
if (isPdf && !textOverride) {
  console.error("this URL is a PDF; extract its text first and pass --text <file> (plus --title and --date)");
  process.exit(1);
}
const html = isPdf ? "" : res.html;
const text = textOverride ? fs.readFileSync(textOverride, "utf8").trim() : htmlToText(html);
const title = titleOverride ?? findTitle(html);
const published = dateOverride ?? findDate(html);
const today = new Date().toISOString().slice(0, 10);
const arch = await archive(url);

fs.mkdirSync(path.join(out, "sources", "text"), { recursive: true });
const textPath = path.join(out, "sources", "text", `${id}.md`);
fs.writeFileSync(textPath, `${title}\n\nSource: ${url}\nRetrieved: ${today}\n\n${text}\n`);

const doc = {
  id,
  source_type: type,
  publisher,
  publisher_org_id: orgId,
  outlet_id: null,
  authors: [],
  title: title || "FILL_IN_TITLE",
  date_published: published ?? "FILL_IN_DATE",
  url,
  archive_url: arch.url,
  archive_status: arch.status,
  text_file: `sources/text/${id}.md`,
  accessed: today,
  report_number: report,
  link_status: "ok",
};
const yamlPath = path.join(out, "sources", `${id}.yaml`);
fs.writeFileSync(yamlPath, stringify(doc));

console.log(`wrote ${yamlPath}`);
console.log(`wrote ${textPath} (${text.length} characters)`);
if (!published) console.log("WARNING: could not detect date_published; edit the YAML (FILL_IN_DATE).");
if (!title) console.log("WARNING: could not detect title; edit the YAML (FILL_IN_TITLE).");
if (arch.status !== "ok") console.log("WARNING: Wayback archive failed; retry later with the same command or save the page manually at https://web.archive.org/save");
else console.log(`archived at ${arch.url}`);
