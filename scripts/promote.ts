/**
 * Moves approved draft events, and every new record they depend on, from
 * drafts/ into data/ (SPEC.md §7.1 step 2). Only records that do not already
 * exist in data/ are moved. Refuses if the combined dataset has validation
 * problems touching the files being moved.
 *
 *   npm run promote -- --reviewer "Name" evt-2019-example [evt-...]
 *   npm run promote -- --reviewer "Name" --all          # every clean draft event
 */
import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { loadDataset, originDir } from "../src/lib/load";
import { validateDataset } from "../src/lib/validate";

const args = process.argv.slice(2);
const ri = args.indexOf("--reviewer");
const reviewer = ri >= 0 ? args.splice(ri, 2)[1] : null;
const all = args.includes("--all");
const ids = args.filter((a) => a.startsWith("evt-"));
if (!reviewer || (!all && ids.length === 0)) {
  console.error('usage: promote --reviewer "Name" (evt-id ... | --all)');
  process.exit(2);
}
const overlay = path.resolve("drafts");
const base = path.resolve("data");
const today = new Date().toISOString().slice(0, 10);

const { dataset: ds, issues: loadIssues } = loadDataset([overlay, base]);
const issues = [...loadIssues, ...validateDataset(ds, { dir: base })];
const badFiles = new Set(issues.map((i) => path.resolve(i.file)));

const inOverlay = (item: object) => originDir(item, base) === overlay;
const events = ds.events.filter((e) => inOverlay(e) && (all || ids.includes(e.id)));
const missing = ids.filter((id) => !events.some((e) => e.id === id));
if (missing.length) { console.error(`not found in drafts: ${missing.join(", ")}`); process.exit(1); }

let movedAny = false;
for (const e of events) {
  // Collect the closure of overlay records this event needs.
  const moves: { from: string; to: string }[] = [];
  const add = (kind: string, id: string, item: object | undefined) => {
    if (!item || !inOverlay(item)) return;
    moves.push({ from: path.join(overlay, kind, `${id}.yaml`), to: path.join(base, kind, `${id}.yaml`) });
  };
  const addOrg = (id: string | null) => {
    if (!id) return;
    const o = ds.organizations.find((x) => x.id === id);
    add("organizations", id, o);
    if (o?.parent_org_id) addOrg(o.parent_org_id);
  };
  const addSource = (id: string) => {
    const s = ds.sources.find((x) => x.id === id);
    add("sources", id, s);
    if (s && inOverlay(s) && s.text_file) moves.push({ from: path.join(overlay, s.text_file), to: path.join(base, s.text_file) });
    if (s?.publisher_org_id) addOrg(s.publisher_org_id);
  };
  moves.push({ from: path.join(overlay, "events", `${e.id}.yaml`), to: path.join(base, "events", `${e.id}.yaml`) });
  for (const p of e.participants) {
    if (p.entity_id.startsWith("per-")) {
      const person = ds.people.find((x) => x.id === p.entity_id);
      add("people", p.entity_id, person);
      for (const pos of person?.positions ?? []) { addOrg(pos.org_id); pos.source_ids.forEach(addSource); }
      person?.party_affiliation.source_ids.forEach(addSource);
    } else addOrg(p.entity_id);
    p.status_history.forEach((s) => s.source_ids.forEach(addSource));
    p.administrative_actions.forEach((a) => a.source_ids.forEach(addSource));
    p.clemency.forEach((c) => c.source_ids.forEach(addSource));
  }
  [...e.agencies, ...e.investigating_agencies, e.prosecuting_office].forEach(addOrg);
  e.relationships.forEach((r) => { [r.from, r.to].forEach((id) => (id.startsWith("per-") ? add("people", id, ds.people.find((x) => x.id === id)) : addOrg(id))); r.source_ids.forEach(addSource); });
  e.court_cases.forEach((c) => c.source_ids.forEach(addSource));
  for (const k of Object.keys(e.money) as (keyof typeof e.money)[]) e.money[k]?.source_ids.forEach(addSource);
  [...e.government_sources, ...e.news_sources].forEach(addSource);
  for (const cid of e.contracts) {
    const c = ds.contracts.find((x) => x.id === cid);
    add("contracts", cid, c);
    if (c) { addOrg(c.awarding_agency_id); addOrg(c.recipient_org_id); c.source_ids.forEach(addSource); }
  }
  const unique = [...new Map(moves.map((m) => [m.from, m])).values()];

  const dirty = unique.filter((m) => badFiles.has(path.resolve(m.from)));
  if (dirty.length) {
    console.error(`SKIP ${e.id}: validation problems in ${dirty.map((m) => path.relative(process.cwd(), m.from)).join(", ")}`);
    continue;
  }
  for (const m of unique) {
    fs.mkdirSync(path.dirname(m.to), { recursive: true });
    if (fs.existsSync(m.to)) { console.error(`SKIP ${e.id}: ${path.relative(process.cwd(), m.to)} already exists in data/`); continue; }
  }
  for (const m of unique) {
    if (m.from.endsWith(`events/${e.id}.yaml`)) {
      const doc = parse(fs.readFileSync(m.from, "utf8")) as Record<string, any>;
      doc.review = { ...(doc.review ?? {}), reviewed_by: reviewer, reviewed_at: today };
      doc.last_updated = today;
      fs.writeFileSync(m.to, stringify(doc, { lineWidth: 0 }));
      fs.unlinkSync(m.from);
    } else {
      fs.renameSync(m.from, m.to);
    }
  }
  movedAny = true;
  console.log(`promoted ${e.id} (${unique.length} files)`);
}
if (movedAny) console.log(`Now run: npm run check`);
