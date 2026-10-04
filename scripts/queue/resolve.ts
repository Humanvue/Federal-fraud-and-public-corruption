/**
 * Resolves a merge conflict in queue/candidates.yaml after `git merge origin/main`.
 * Starts from main's copy (it may hold new items from the daily job) and applies every
 * state and note this branch changed, so triage decisions and their reasons survive.
 *
 *   npm run queue:resolve      # then: git add queue/candidates.yaml && git commit
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { parse, stringify } from "yaml";
import { QueueFile, type Candidate } from "../../src/schemas/queue";

const FILE = "queue/candidates.yaml";
const show = (stage: 2 | 3) => execFileSync("git", ["show", `:${stage}:${FILE}`], { encoding: "utf8" });
const ours = QueueFile.parse(parse(show(2)) ?? {}).candidates; // this branch
const theirsText = show(3); // main
const theirs = QueueFile.parse(parse(theirsText) ?? {}).candidates;

const byId = new Map(ours.map((c) => [c.id, c]));
let applied = 0;
const merged: Candidate[] = theirs.map((c) => {
  const mine = byId.get(c.id);
  if (mine && (mine.state !== c.state || mine.note !== c.note)) { applied++; return { ...c, state: mine.state, note: mine.note }; }
  return c;
});
// Items only this branch has (should not happen, but never drop a decision).
const theirIds = new Set(theirs.map((c) => c.id));
const onlyOurs = ours.filter((c) => !theirIds.has(c.id));
merged.push(...onlyOurs);

const header = theirsText.split("\n").filter((l) => l.startsWith("#")).join("\n");
fs.writeFileSync(FILE, (header ? header + "\n" : "") + stringify({ candidates: merged }, { lineWidth: 0 }));
const added = theirs.filter((c) => !byId.has(c.id));
console.log(`resolved ${FILE}: ${applied} state changes from this branch applied to main's copy; ${added.length} new items from main kept; ${onlyOurs.length} branch-only items kept`);
for (const c of added) console.log(`  + new from main: [${c.kind}] ${c.title}`);
