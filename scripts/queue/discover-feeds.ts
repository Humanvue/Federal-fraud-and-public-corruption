/**
 * Finds the RSS feed of every U.S. Attorney's Office (and DOJ headquarters) and writes
 * queue/feeds.yaml. Run rarely: offices' feed addresses embed internal ids that seldom change.
 *
 *   npm run queue:discover                     # all offices; rewrites queue/feeds.yaml
 *   npm run queue:discover -- usao-mdfl usao-wdtx   # only these; merged into the existing file
 */
import fs from "node:fs";
import { parse, stringify } from "yaml";
import { fetchPage } from "../../src/lib/archive";

const BASE = "https://www.justice.gov";
const onlySlugs = process.argv.slice(2).filter((a) => a.startsWith("usao-"));

/** Offices format the link as /news/rss?type=press_release or /rss?type[0]=press_release, on /pr or /news. */
export const FEED_LINK = /href="([^"]*\/(?:news\/)?rss\?type(?:%5B0%5D|\[0\])?=press_release[^"]*)"/;

const directory = await fetchPage(`${BASE}/usao/find-your-united-states-attorney`);
const allSlugs = [...new Set([...directory.html.matchAll(/href="(?:https:\/\/www\.justice\.gov)?\/(usao-[a-z]+)"/g)].map((m) => m[1]))].sort();
const slugs = onlySlugs.length ? onlySlugs : allSlugs;
console.log(`directory: HTTP ${directory.status}, ${allSlugs.length} offices${onlySlugs.length ? `; checking ${slugs.length}` : ""}`);
if (allSlugs.length < 90) {
  console.error("expected about 94 offices; the directory page format may have changed");
  process.exit(1);
}

type Feed = { id: string; name: string; url: string };
const existing: Feed[] = onlySlugs.length && fs.existsSync("queue/feeds.yaml") ? (parse(fs.readFileSync("queue/feeds.yaml", "utf8")) as { feeds: Feed[] }).feeds : [];
const feeds: Feed[] = onlySlugs.length
  ? existing.filter((f) => !onlySlugs.includes(f.id))
  : [{ id: "doj-opa", name: "U.S. Department of Justice, Office of Public Affairs", url: `${BASE}/news/rss?type=press_release&m=1` }];
const failures: string[] = [];
for (const slug of slugs) {
  let page = await fetchPage(`${BASE}/${slug}/pr`);
  let href = FEED_LINK.exec(page.html)?.[1]?.replace(/&amp;/g, "&");
  if (!href) {
    page = await fetchPage(`${BASE}/${slug}/news`);
    href = FEED_LINK.exec(page.html)?.[1]?.replace(/&amp;/g, "&");
  }
  const name = /<title>([^<|]+)/.exec(page.html)?.[1]?.replace(/Press Releases?\s*[-|]?\s*/i, "").trim() ?? slug;
  if (!href) { failures.push(slug); console.log(`  ${slug}: no feed link (HTTP ${page.status})`); continue; }
  feeds.push({ id: slug, name: `U.S. Attorney's Office, ${name.replace(/^United States Attorney'?s Office,?\s*/i, "")}`.replace(/\s+/g, " ").trim(), url: href.startsWith("http") ? href : BASE + href });
  console.log(`  ${slug}: ok`);
}
feeds.sort((a, b) => (a.id === "doj-opa" ? -1 : b.id === "doj-opa" ? 1 : a.id.localeCompare(b.id)));
fs.writeFileSync("queue/feeds.yaml", "# DOJ press release feeds polled by the daily queue job. Regenerate with npm run queue:discover.\n" + stringify({ generated: new Date().toISOString().slice(0, 10), feeds }, { lineWidth: 0 }));
console.log(`\nwrote queue/feeds.yaml: ${feeds.length} feeds; ${failures.length} offices without a feed: ${failures.join(", ")}`);
