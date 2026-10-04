/**
 * Loads a tier enumeration (drafts/tiers/<tier>.yaml, written by research) into the queue as
 * new-case candidates tagged tier:<id>. An item whose person already appears as a participant in a
 * published event within a year of the item's date is marked done and linked to that event; other
 * items stay open for the weekly session. Mark an item `separate_matter: true` to stop a wrong auto-link. Also refreshes `enumerated_on` in data/reference/tiers.yaml.
 *
 *   npm run backfill:tier -- drafts/tiers/hatch-act.yaml [--dry]
 */
import fs from "node:fs";
import { parse, stringify } from "yaml";
import { z } from "zod";
import { loadDataset } from "../../src/lib/load";
import { QueueFile, type Candidate } from "../../src/schemas/queue";
import { Tiers } from "../../src/schemas/reference";
import { candidateId, mergeCandidates } from "../../src/lib/queue/merge";
import { nameAppears } from "../../src/lib/queue/pardon";
import { yearOf } from "../../src/schemas/common";

const Item = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  url: z.url(),
  date: z.union([z.string(), z.number()]).transform(String),
  person: z.string().min(1),
  role: z.string().optional(),
  note: z.string().nullable().optional(),
  /** Set when the person is already published for a DIFFERENT matter, so the item is never auto-linked. */
  separate_matter: z.boolean().optional(),
});
const File = z.object({ tier: z.string(), definition: z.string(), enumerated_from: z.string(), enumerated_on: z.union([z.string(), z.date()]).transform(String), items: z.array(Item), unconfirmed: z.array(z.string()).optional() });

const file = process.argv[2];
const dry = process.argv.includes("--dry");
if (!file) { console.error("usage: backfill:tier <drafts/tiers/x.yaml> [--dry]"); process.exit(2); }
const doc = File.parse(parse(fs.readFileSync(file, "utf8")));
const tiersDoc = Tiers.parse(parse(fs.readFileSync("data/reference/tiers.yaml", "utf8")));
if (!tiersDoc.tiers.some((t) => t.id === doc.tier)) { console.error(`unknown tier ${doc.tier}; add it to data/reference/tiers.yaml first`); process.exit(1); }

const { dataset } = loadDataset("data");
const today = new Date().toISOString().slice(0, 10);
const fresh: Candidate[] = [];
const linked: string[] = [];
for (const it of doc.items) {
  const year = Number(it.date.slice(0, 4));
  const person = dataset.people.find((p) => [p.name, ...p.aliases].some((n) => nameAppears(n, it.person) || nameAppears(it.person, n)));
  const event = person && !it.separate_matter && dataset.events.find((e) => e.participants.some((p) => p.entity_id === person.id) && Math.abs(yearOf(e.dates.first_public_action) - year) <= 1);
  if (event) linked.push(`${it.key} -> ${event.id}`);
  fresh.push({
    id: candidateId(`tier:${doc.tier}#${it.key}`),
    kind: "new_case",
    source: "tier_list",
    url: it.url,
    title: it.title,
    date: it.date,
    feed: null,
    tags: [`tier:${doc.tier}`, "backfill"],
    event_id: event?.id ?? null,
    entity_id: person?.id ?? null,
    first_seen: today,
    state: event ? "done" : "open",
    note: event ? "Already published when the tier was enumerated." : person ? `Person already in data (${person.id}); check whether this is a different matter.` : (it.note ?? null),
  });
}
const q = QueueFile.parse(parse(fs.readFileSync("queue/candidates.yaml", "utf8")) ?? {});
const { merged, added } = mergeCandidates(q.candidates, fresh);
console.log(`tier ${doc.tier}: ${doc.items.length} items, ${added.length} new to the queue (${added.filter((a) => a.state === "done").length} already published), ${doc.unconfirmed?.length ?? 0} unconfirmed (not queued)`);
for (const l of linked) console.log(`  linked ${l}`);
if (!dry) {
  const header = fs.readFileSync("queue/candidates.yaml", "utf8").split("\n").filter((l) => l.startsWith("#")).join("\n");
  fs.writeFileSync("queue/candidates.yaml", (header ? header + "\n" : "") + stringify({ candidates: merged }, { lineWidth: 0 }));
  const tf = fs.readFileSync("data/reference/tiers.yaml", "utf8");
  const re = new RegExp(`(  - id: ${doc.tier}\\n(?:    .*\\n)*?    enumerated_on: )[^\\n]*`);
  fs.writeFileSync("data/reference/tiers.yaml", tf.replace(re, `$1"${doc.enumerated_on.slice(0, 10)}"`));
}
