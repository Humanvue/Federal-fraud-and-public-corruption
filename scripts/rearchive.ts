/**
 * Retries the Wayback archive for every source in a directory whose
 * archive_status is not "ok", one at a time with a pause, and rewrites the
 * YAML with the confirmed snapshot URL.
 *
 *   npm run rearchive                      # drafts/sources
 *   npm run rearchive -- data              # data/sources
 *   npm run rearchive -- drafts --pause 60 # wait 60 s between sources (use after HTTP 429s)
 */
import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { archive } from "../src/lib/archive";

const args = process.argv.slice(2);
const pi = args.indexOf("--pause");
const pauseMs = pi >= 0 ? Number(args.splice(pi, 2)[1]) * 1000 : 4000;
const dir = path.join(args[0] ?? "drafts", "sources");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort();
let fixed = 0, failed = 0, skipped = 0;
for (const f of files) {
  const file = path.join(dir, f);
  const doc = parse(fs.readFileSync(file, "utf8")) as Record<string, any>;
  if (doc.archive_status === "ok" && doc.archive_url) { skipped++; continue; }
  process.stdout.write(`${doc.id} ... `);
  const r = await archive(doc.url);
  if (r.status === "ok") {
    doc.archive_url = r.url;
    doc.archive_status = "ok";
    fs.writeFileSync(file, stringify(doc, { lineWidth: 0 }));
    fixed++;
    console.log(`ok ${r.url}`);
  } else {
    failed++;
    console.log("still failing");
  }
  await new Promise((res) => setTimeout(res, pauseMs));
}
console.log(`\nre-archived ${fixed}, still failing ${failed}, already ok ${skipped}`);
