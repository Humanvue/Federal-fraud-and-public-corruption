/**
 * Prints the opening of each open new-case candidate's press release, for weekly-session triage.
 * Reads pages only; writes nothing to the project.
 *   npm run queue:peek [-- --chars 1500] [-- q-abc123 ...]
 */
import fs from "node:fs";
import { parse } from "yaml";
import { QueueFile } from "../../src/schemas/queue";
import { fetchPage, htmlToText } from "../../src/lib/archive";

const args = process.argv.slice(2);
const ci = args.indexOf("--chars");
const chars = ci >= 0 ? Number(args.splice(ci, 2)[1]) : 1200;
const ids = args.filter((a) => a.startsWith("q-"));
const q = QueueFile.parse(parse(fs.readFileSync("queue/candidates.yaml", "utf8")) ?? {});
const items = q.candidates.filter((c) => c.state === "open" && c.kind === "new_case" && c.url && (!ids.length || ids.includes(c.id)));
for (const c of items) {
  let body = "";
  try {
    const r = await fetchPage(c.url!);
    const text = htmlToText(r.html);
    const start = text.search(/For Immediate Release|Press Release/i);
    body = text.slice(start >= 0 ? start : 0).replace(/^(For Immediate Release|Press Release)\s*/i, "").replace(/\s+/g, " ").slice(0, chars);
  } catch (e) {
    body = `(could not fetch: ${(e as Error).message})`;
  }
  console.log(`\n### ${c.id} | ${c.date} | ${c.feed}\n${c.title}\n${c.url}\n${body}`);
}
