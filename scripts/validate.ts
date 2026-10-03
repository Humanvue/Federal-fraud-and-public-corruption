import path from "node:path";
import { validateDir } from "../src/lib/validate";

// Usage: validate [overlayDir ...] [baseDir]   e.g. `validate drafts data` checks drafts on top of data.
const dirs = process.argv.slice(2);
if (dirs.length === 0) dirs.push("data");
const dir = dirs[dirs.length - 1];
const { issues, dataset } = validateDir(dirs);

const counts = `${dataset.events.length} events, ${dataset.people.length} people, ${dataset.organizations.length} organizations, ${dataset.contracts.length} contracts, ${dataset.sources.length} sources, ${dataset.corrections.length} corrections`;

if (issues.length === 0) {
  console.log(`OK: ${counts} in ${dirs.map((d) => path.resolve(d)).join(" + ")}`);
  process.exit(0);
}

const byFile = new Map<string, string[]>();
for (const i of issues) {
  const rel = path.relative(process.cwd(), i.file);
  byFile.set(rel, [...(byFile.get(rel) ?? []), i.message]);
}
for (const [file, messages] of byFile) {
  console.error(file);
  for (const m of messages) console.error(`  - ${m}`);
}
console.error(`\nFAILED: ${issues.length} problem${issues.length === 1 ? "" : "s"} in ${byFile.size} file${byFile.size === 1 ? "" : "s"} (${counts})`);
process.exit(1);
