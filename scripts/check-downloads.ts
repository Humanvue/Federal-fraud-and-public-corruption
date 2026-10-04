/**
 * Verifies the published download files in dist/ after `npm run build` (SPEC.md §11, Phase 2:
 * "downloads validate"). Every JSON record must pass the data schemas, and every CSV must have
 * the expected columns, one row per record, and parse back to the values the exporter produced.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { Contract, CpiU, Event, Organization, Person, Source } from "../src/schemas";
import { validateDir } from "../src/lib/validate";
import { TABLES, toCSV, type TableName } from "../src/lib/export";
import { parseCSV } from "../src/lib/csv-parse";

const dist = path.resolve(process.argv[2] ?? "dist");
const dataDir = process.argv[3] ?? "data";
const problems: string[] = [];
const fail = (m: string) => problems.push(m);

const { dataset, issues } = validateDir(dataDir);
if (issues.length) fail(`source data has ${issues.length} validation problems; run npm run validate`);

// ---- dataset.json
const jsonPath = path.join(dist, "downloads", "dataset.json");
if (!fs.existsSync(jsonPath)) fail("missing downloads/dataset.json");
else {
  const doc = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const check = (label: string, schema: z.ZodType, items: unknown[], strip?: (x: any) => unknown) => {
    items.forEach((x: any, i) => {
      const r = schema.safeParse(strip ? strip(x) : x);
      if (!r.success) fail(`dataset.json ${label}[${i}] (${x?.id}): ${r.error.issues[0]?.path.join(".")}: ${r.error.issues[0]?.message}`);
    });
  };
  check("events", Event, doc.events ?? [], ({ derived, ...rest }) => rest);
  check("people", Person, doc.people ?? []);
  check("organizations", Organization, doc.organizations ?? []);
  check("contracts", Contract, doc.contracts ?? []);
  check("sources", Source, doc.sources ?? []);
  if (doc.cpi_u) check("cpi_u", CpiU, [doc.cpi_u]);
  for (const [k, n] of [["events", dataset.events.length], ["people", dataset.people.length], ["organizations", dataset.organizations.length], ["sources", dataset.sources.length]] as const) {
    if ((doc[k]?.length ?? -1) !== n) fail(`dataset.json has ${doc[k]?.length} ${k}; data has ${n}`);
  }
  for (const e of doc.events ?? []) if (!e.derived?.case_status) fail(`dataset.json event ${e.id} lacks derived.case_status`);
}

// ---- CSV tables
for (const name of Object.keys(TABLES) as TableName[]) {
  const file = path.join(dist, "downloads", name);
  if (!fs.existsSync(file)) { fail(`missing downloads/${name}`); continue; }
  const published = fs.readFileSync(file, "utf8");
  const expected = TABLES[name].build(dataset);
  const parsed = parseCSV(published);
  const [header, ...body] = parsed;
  if (header.join(",") !== expected.columns.join(",")) fail(`${name}: header differs from the exporter's columns`);
  if (body.length !== expected.rows.length) fail(`${name}: ${body.length} rows published, ${expected.rows.length} expected`);
  body.forEach((r, i) => { if (r.length !== expected.columns.length) fail(`${name} row ${i + 2}: ${r.length} cells, expected ${expected.columns.length}`); });
  if (published !== toCSV(expected)) fail(`${name}: content differs from a fresh export (rebuild the site)`);
}

if (problems.length) {
  for (const p of problems) console.error(`  - ${p}`);
  console.error(`\nFAILED: ${problems.length} download problem${problems.length === 1 ? "" : "s"}`);
  process.exit(1);
}
console.log(`OK: dataset.json and ${Object.keys(TABLES).length} CSV files validate (${dataset.events.length} cases)`);
