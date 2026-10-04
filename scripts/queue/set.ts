/**
 * Changes the state of queue items during the weekly session.
 *   npm run queue:set -- <id>[,<id>...] <open|drafted|rejected|done> ["note"]
 */
import fs from "node:fs";
import { parse, stringify } from "yaml";
import { CandidateState, QueueFile } from "../../src/schemas/queue";

const [ids, stateArg, note] = process.argv.slice(2);
const st = CandidateState.safeParse(stateArg);
if (!ids || !st.success) {
  console.error('usage: queue:set <id>[,<id>...] <open|drafted|rejected|done> ["note"]');
  process.exit(2);
}
const text = fs.readFileSync("queue/candidates.yaml", "utf8");
const header = text.split("\n").filter((l) => l.startsWith("#")).join("\n");
const q = QueueFile.parse(parse(text) ?? {});
const wanted = ids.split(",");
const missing = wanted.filter((id) => !q.candidates.some((c) => c.id === id));
if (missing.length) { console.error(`not in queue: ${missing.join(", ")}`); process.exit(1); }
for (const c of q.candidates) if (wanted.includes(c.id)) { c.state = st.data; if (note) c.note = note; }
fs.writeFileSync("queue/candidates.yaml", (header ? header + "\n" : "") + stringify({ candidates: q.candidates }, { lineWidth: 0 }));
console.log(`set ${wanted.length} item(s) to ${st.data}`);
