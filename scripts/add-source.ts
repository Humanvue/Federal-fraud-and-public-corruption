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
import { archive, fetchPage, findDate, findTitle, htmlToText } from "../src/lib/archive";

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
