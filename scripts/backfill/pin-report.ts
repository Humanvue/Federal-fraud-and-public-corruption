/**
 * Backfill (SPEC.md §11 Phase 4): adds the federal-branch cases described in a Public Integrity Section
 * Report to Congress to the queue as new-case candidates. Each candidate is the report's own case caption
 * ("US v. Name, District") with a link to the report. State, local, and election-crime sections are
 * skipped (outside v1). Cases whose defendant is already in data/ are skipped.
 *
 *   npm run backfill:pin -- --year 2023 --url <report url> --text <extracted text file> [--dry]
 */
import fs from "node:fs";
import { parse, stringify } from "yaml";
import { loadDataset } from "../../src/lib/load";
import { QueueFile, type Candidate } from "../../src/schemas/queue";
import { candidateId, mergeCandidates } from "../../src/lib/queue/merge";
import { nameAppears } from "../../src/lib/queue/pardon";
import { defendantOf, isOutOfScopeSection, parsePartII } from "../../src/lib/backfill/pin";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const year = arg("year"), url = arg("url"), textFile = arg("text");
const dry = process.argv.includes("--dry");
if (!year || !url || !textFile) { console.error("usage: --year YYYY --url <report url> --text <file> [--dry]"); process.exit(2); }

const captions = parsePartII(fs.readFileSync(textFile, "utf8"));

const { dataset } = loadDataset("data");
const today = new Date().toISOString().slice(0, 10);
const fresh: Candidate[] = [];
const skipped: string[] = [];
for (const { caption, section } of captions) {
  if (isOutOfScopeSection(section)) { skipped.push(`${section}: ${caption}`); continue; }
  const defendant = defendantOf(caption);
  const known = dataset.people.find((p) => [p.name, ...p.aliases].some((n) => nameAppears(n, defendant) || nameAppears(defendant, n)));
  if (known) { skipped.push(`already in data (${known.id}): ${caption}`); continue; }
  fresh.push({
    id: candidateId(`pin-${year}#${caption.toLowerCase()}`),
    kind: "new_case",
    source: "pin_report",
    url,
    title: `${caption} (Public Integrity Section report for ${year}, ${section === "UNKNOWN" ? "section not detected" : section.toLowerCase()})`,
    date: `${year}`,
    feed: null,
    tags: ["pin_report", "backfill", section === "UNKNOWN" ? "section_unknown" : section.toLowerCase().replace(/ /g, "_")],
    event_id: null,
    entity_id: null,
    first_seen: today,
    state: "open",
    note: null,
  });
}
const q = QueueFile.parse(parse(fs.readFileSync("queue/candidates.yaml", "utf8")) ?? {});
const { merged, added } = mergeCandidates(q.candidates, fresh);
console.log(`report ${year}: ${fresh.length} federal-branch captions, ${added.length} new to the queue, ${skipped.length} skipped`);
for (const c of added) console.log(`  + ${c.title}`);
for (const s of skipped) console.log(`  - ${s}`);
if (!dry) {
  const header = fs.readFileSync("queue/candidates.yaml", "utf8").split("\n").filter((l) => l.startsWith("#")).join("\n");
  fs.writeFileSync("queue/candidates.yaml", (header ? header + "\n" : "") + stringify({ candidates: merged }, { lineWidth: 0 }));
}
