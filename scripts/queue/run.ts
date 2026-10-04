/**
 * The daily queue job (SPEC.md §7.1 step 1). Gathers candidates from DOJ press release feeds,
 * court dockets of moving cases, Pardon Attorney clemency lists, and the staleness rule, then
 * merges them into queue/candidates.yaml. Writes only links, public titles, dates, and tags.
 *
 *   npm run queue                      # all sources
 *   npm run queue -- --only doj,staleness
 *   npm run queue -- --dry             # print what would be added; write nothing
 */
import fs from "node:fs";
import { parse, stringify } from "yaml";
import { loadDataset } from "../../src/lib/load";
import { QueueFile, QueueState, type Candidate, type QueueStateT } from "../../src/schemas/queue";
import { mergeCandidates } from "../../src/lib/queue/merge";
import { feedCandidates, fetchFeed } from "../../src/lib/queue/doj";
import { RateLimited, docketCandidates, fetchDocketEntries, newEntries, watchedDockets } from "../../src/lib/queue/courtlistener";
import { PARDON_PAGES, fetchPardonPage, pardonCandidates } from "../../src/lib/queue/pardon";
import { stalenessCandidates } from "../../src/lib/queue/staleness";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const oi = args.indexOf("--only");
const only = oi >= 0 ? new Set(args[oi + 1].split(",")) : null;
const want = (s: string) => !only || only.has(s);
const today = new Date().toISOString().slice(0, 10);

const QFILE = "queue/candidates.yaml";
const SFILE = "queue/state.yaml";
const queue = QueueFile.parse(parse(fs.readFileSync(QFILE, "utf8")) ?? {});
const state: QueueStateT = QueueState.parse(fs.existsSync(SFILE) ? parse(fs.readFileSync(SFILE, "utf8")) ?? {} : {});
const { dataset, issues } = loadDataset("data");
if (issues.length) { console.error(`data/ has ${issues.length} load problems; run npm run validate`); process.exit(1); }

const knownUrls = new Set(dataset.sources.map((s) => s.url));
const started = Date.now();
const log = (m: string) => console.log(`[${Math.round((Date.now() - started) / 1000)}s] ${m}`);
/** Each source stops starting new requests once its budget is spent, so the job ends in time. */
const BUDGET_MS = { doj: 25 * 60_000, courtlistener: 20 * 60_000 };
const fresh: Candidate[] = [];
const report: string[] = [];

if (want("doj")) {
  const feeds = (parse(fs.readFileSync("queue/feeds.yaml", "utf8")) as { feeds: { id: string; url: string }[] }).feeds;
  let ok = 0, failed = 0, flagged = 0, skipped = 0;
  const t0 = Date.now();
  for (const [i, f] of feeds.entries()) {
    if (Date.now() - t0 > BUDGET_MS.doj) { skipped = feeds.length - i; break; }
    if (i % 10 === 0) log(`doj: feed ${i + 1} of ${feeds.length}`);
    try {
      const { status, items } = await fetchFeed(f.url);
      if (status !== 200) { failed++; report.push(`doj: ${f.id} HTTP ${status}`); continue; }
      ok++;
      const c = feedCandidates(items, f.id, knownUrls, today);
      flagged += c.length;
      fresh.push(...c);
    } catch (e) {
      failed++;
      report.push(`doj: ${f.id} ${(e as Error).message}`);
    }
  }
  report.push(`doj: ${ok} feeds read, ${failed} failed, ${skipped} skipped (time budget), ${flagged} titles flagged`);
}

if (want("courtlistener")) {
  const watched = watchedDockets(dataset, today);
  let checked = 0, flagged = 0;
  const t0 = Date.now();
  log(`courtlistener: ${watched.length} dockets to check`);
  for (const w of watched) {
    if (Date.now() - t0 > BUDGET_MS.courtlistener) { report.push("courtlistener: time budget spent; remaining dockets wait for the next run"); break; }
    const ev = dataset.events.find((e) => e.id === w.eventId)!;
    // Baseline for a docket never checked: the latest date anyone in the case was verified.
    const verified = ev.participants.map((p) => p.status_verified).sort().pop() ?? null;
    const last = state.dockets[w.key]?.last_entry ?? verified;
    let res: Awaited<ReturnType<typeof fetchDocketEntries>>;
    try {
      res = await fetchDocketEntries(w);
    } catch (e) {
      if (e instanceof RateLimited) { report.push(`courtlistener: rate limited (retry after ${e.retryAfterSeconds} s); remaining dockets wait for the next run`); break; }
      report.push(`courtlistener: ${w.key} ${(e as Error).message}`);
      continue;
    }
    const { status, entries } = res;
    if (status !== 200) { report.push(`courtlistener: ${w.key} HTTP ${status}`); continue; }
    checked++;
    const c = docketCandidates(w, newEntries(entries, last), today);
    flagged += c.length;
    fresh.push(...c);
    const newest = entries.map((e) => e.date).sort().pop() ?? last;
    state.dockets[w.key] = { last_entry: newest && last && newest < last ? last : newest, checked: today };
    await new Promise((r) => setTimeout(r, process.env.COURTLISTENER_TOKEN ? 1000 : 13_000));
  }
  report.push(`courtlistener: ${checked} of ${watched.length} watched dockets checked, ${flagged} new entries`);
  log("courtlistener: done");
}

if (want("pardon")) {
  log("pardon: checking clemency lists");
  for (const url of PARDON_PAGES) {
    let page: { status: number; text: string };
    try { page = await fetchPardonPage(url); } catch (e) { report.push(`pardon: ${url} ${(e as Error).message}`); continue; }
    const { status, text } = page;
    if (status !== 200) { report.push(`pardon: ${url} HTTP ${status}`); continue; }
    const c = pardonCandidates(dataset, url, text, today);
    fresh.push(...c);
    report.push(`pardon: ${c.length} name matches for people without recorded clemency`);
  }
}

if (want("staleness")) {
  const c = stalenessCandidates(dataset, today);
  fresh.push(...c);
  report.push(`staleness: ${c.length} people due for re-verification`);
}

// The same release often appears in a headquarters feed and an office feed under different URLs.
const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const seenTitles = new Set(queue.candidates.filter((c) => c.kind === "new_case").map((c) => normTitle(c.title)));
const deduped = fresh.filter((c) => {
  if (c.kind !== "new_case") return true;
  const k = normTitle(c.title);
  if (seenTitles.has(k)) return false;
  seenTitles.add(k);
  return true;
});
const { merged, added } = mergeCandidates(queue.candidates, deduped);
for (const line of report) console.log(line);
console.log(`\n${added.length} new candidates (${merged.filter((c) => c.state === "open").length} open in queue)`);
for (const c of added) console.log(`  + [${c.kind}] ${c.title}${c.url ? `  ${c.url}` : ""}`);

if (!dry) {
  state.last_run = new Date().toISOString();
  fs.writeFileSync(QFILE, "# Daily queue written by the queue job (npm run queue). Links, public titles, dates, and rule tags only.\n# Never drafts or summaries. The weekly session changes `state` with npm run queue:set. See SPEC.md §7.\n" + stringify({ candidates: merged }, { lineWidth: 0 }));
  fs.writeFileSync(SFILE, "# Bookkeeping for the queue job: last docket entry seen per watched docket.\n" + stringify(state, { lineWidth: 0 }));
}
