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
import { docketCandidates, fetchDocketEntries, newEntries, watchedDockets } from "../../src/lib/queue/courtlistener";
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
const fresh: Candidate[] = [];
const report: string[] = [];

if (want("doj")) {
  const feeds = (parse(fs.readFileSync("queue/feeds.yaml", "utf8")) as { feeds: { id: string; url: string }[] }).feeds;
  let ok = 0, failed = 0, flagged = 0;
  for (const f of feeds) {
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
  report.push(`doj: ${ok} feeds read, ${failed} failed, ${flagged} titles flagged`);
}

if (want("courtlistener")) {
  const watched = watchedDockets(dataset, today);
  let checked = 0, flagged = 0;
  for (const w of watched) {
    const ev = dataset.events.find((e) => e.id === w.eventId)!;
    // Baseline for a docket never checked: the latest date anyone in the case was verified.
    const verified = ev.participants.map((p) => p.status_verified).sort().pop() ?? null;
    const last = state.dockets[w.key]?.last_entry ?? verified;
    const { status, entries } = await fetchDocketEntries(w);
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
}

if (want("pardon")) {
  for (const url of PARDON_PAGES) {
    const { status, text } = await fetchPardonPage(url);
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

const { merged, added } = mergeCandidates(queue.candidates, fresh);
for (const line of report) console.log(line);
console.log(`\n${added.length} new candidates (${merged.filter((c) => c.state === "open").length} open in queue)`);
for (const c of added) console.log(`  + [${c.kind}] ${c.title}${c.url ? `  ${c.url}` : ""}`);

if (!dry) {
  state.last_run = new Date().toISOString();
  fs.writeFileSync(QFILE, "# Daily queue written by the queue job (npm run queue). Links, public titles, dates, and rule tags only.\n# Never drafts or summaries. The weekly session changes `state` with npm run queue:set. See SPEC.md §7.\n" + stringify({ candidates: merged }, { lineWidth: 0 }));
  fs.writeFileSync(SFILE, "# Bookkeeping for the queue job: last docket entry seen per watched docket.\n" + stringify(state, { lineWidth: 0 }));
}
