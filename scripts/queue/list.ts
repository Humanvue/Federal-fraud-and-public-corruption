/**
 * Summarizes the queue for the weekly session.
 *   npm run queue:list               # open items, grouped
 *   npm run queue:list -- --all      # every item
 */
import fs from "node:fs";
import { parse } from "yaml";
import { QueueFile } from "../../src/schemas/queue";

const all = process.argv.includes("--all");
const q = QueueFile.parse(parse(fs.readFileSync("queue/candidates.yaml", "utf8")) ?? {});
const items = all ? q.candidates : q.candidates.filter((c) => c.state === "open");
const groups: Record<string, typeof items> = {};
for (const c of items) (groups[c.kind] ??= []).push(c);
const LABEL: Record<string, string> = { status_update: "Updates to cases already published", verify_status: "Status re-verification due", new_case: "Possible new cases" };
for (const kind of ["status_update", "verify_status", "new_case"]) {
  const g = groups[kind] ?? [];
  if (!g.length) continue;
  console.log(`\n## ${LABEL[kind]} (${g.length})`);
  for (const c of g) {
    console.log(`- ${c.id} [${c.state}] ${c.date ?? ""} ${c.title}`);
    if (c.url) console.log(`    ${c.url}`);
    const meta = [c.event_id && `event ${c.event_id}`, c.entity_id && `person ${c.entity_id}`, c.tags.length && `tags ${c.tags.join(", ")}`, c.note].filter(Boolean).join(" · ");
    if (meta) console.log(`    ${meta}`);
  }
}
const counts = q.candidates.reduce<Record<string, number>>((m, c) => ((m[c.state] = (m[c.state] ?? 0) + 1), m), {});
console.log(`\nQueue: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ") || "empty"}`);
