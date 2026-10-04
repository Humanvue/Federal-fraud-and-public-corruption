/**
 * Renders one review card per draft event so the owner can approve, edit, or
 * reject it (SPEC.md §7.1 step 2). Reads drafts/ as an overlay on data/.
 *
 *   npm run review                      # drafts on data → drafts/review/*.md + INDEX.md
 *   npm run review -- <overlay> <base> [--out <dir>]
 */
import fs from "node:fs";
import path from "node:path";
import { loadDataset, originDir, type Dataset } from "../src/lib/load";
import { validateDataset } from "../src/lib/validate";
import { currentStatus, eventStatus, reviewPriority } from "../src/lib/derive";
import { ACTOR_LABELS, BASIS_LABELS, CATEGORY_LABELS, MONEY_LABELS, ROLE_LABELS, STATUS_LABELS, formatDate, formatUSD } from "../src/lib/format";
import { MONEY_FIELDS, type Event } from "../src/schemas/event";

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outDir = outIdx >= 0 ? args.splice(outIdx, 2)[1] : null;
const overlay = path.resolve(args[0] ?? "drafts");
const base = path.resolve(args[1] ?? "data");
const out = path.resolve(outDir ?? path.join(overlay, "review"));

const { dataset, issues: loadIssues } = loadDataset([overlay, base]);
const issues = [...loadIssues, ...validateDataset(dataset, { dir: base })];
const issuesByFile = new Map<string, string[]>();
for (const i of issues) issuesByFile.set(path.resolve(i.file), [...(issuesByFile.get(path.resolve(i.file)) ?? []), i.message]);

const name = (ds: Dataset, id: string) => ds.people.find((p) => p.id === id)?.name ?? ds.organizations.find((o) => o.id === id)?.name ?? `${id} (MISSING)`;
const src = (ds: Dataset, id: string) => ds.sources.find((s) => s.id === id);

/** Every overlay file this event depends on, so its validation problems appear on the card. */
function relatedFiles(ds: Dataset, e: Event): string[] {
  const files = new Set<string>([path.join(originDir(e, base), "events", `${e.id}.yaml`)]);
  const ids = new Set<string>([...e.participants.map((p) => p.entity_id), ...e.agencies, ...e.investigating_agencies, ...(e.prosecuting_office ? [e.prosecuting_office] : []), ...e.relationships.flatMap((r) => [r.from, r.to])]);
  for (const id of ids) {
    const p = ds.people.find((x) => x.id === id);
    if (p) files.add(path.join(originDir(p, base), "people", `${id}.yaml`));
    const o = ds.organizations.find((x) => x.id === id);
    if (o) files.add(path.join(originDir(o, base), "organizations", `${id}.yaml`));
  }
  for (const sid of [...e.government_sources, ...e.news_sources]) {
    const s = src(ds, sid);
    if (s) files.add(path.join(originDir(s, base), "sources", `${sid}.yaml`));
  }
  return [...files];
}

function notesFor(e: Event, ds: Dataset): string[] {
  const dir = path.join(overlay, "notes");
  if (!fs.existsSync(dir)) return [];
  const keys = [e.id, ...e.participants.map((p) => name(ds, p.entity_id).split(" ").pop() ?? "")].filter(Boolean).map((k) => k.toLowerCase());
  const hits: string[] = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    for (const line of fs.readFileSync(path.join(dir, f), "utf8").split("\n")) {
      const l = line.toLowerCase();
      if (keys.some((k) => l.includes(k))) hits.push(`${f}: ${line.trim()}`);
    }
  }
  return hits;
}

function card(ds: Dataset, e: Event): string {
  const L: string[] = [];
  const pr = reviewPriority(e);
  L.push(`# ${e.title}`, "", `**Event:** \`${e.id}\` · **Categories:** ${e.categories.map((c) => CATEGORY_LABELS[c]).join(", ")} · **First official action:** ${formatDate(e.dates.first_public_action)} · **Case status:** ${eventStatus(e)}`, "");
  L.push(`**Review priority:** ${pr.priority.toUpperCase()}${pr.reasons.length ? ` — ${pr.reasons.join("; ")}` : ""}`, "");
  L.push(`**Conduct:** ${formatDate(e.dates.conduct_start)} to ${formatDate(e.dates.conduct_end)} · **Agencies:** ${e.agencies.map((id) => name(ds, id)).join(", ") || "none"} · **Investigated by:** ${e.investigating_agencies.map((id) => name(ds, id)).join(", ") || "none"} · **Prosecuting office:** ${e.prosecuting_office ? name(ds, e.prosecuting_office) : "none"}`, "");
  if (e.court_cases.length) L.push(`**Court cases:** ${e.court_cases.map((c) => `${c.court}, ${c.docket ?? "docket NOT CONFIRMED"}`).join("; ")}`, "");

  L.push("## Participants", "");
  for (const p of e.participants) {
    const cur = currentStatus(p);
    L.push(`### ${name(ds, p.entity_id)} — ${ACTOR_LABELS[p.actor_type]}${p.position ? `, ${p.position}` : ""}`);
    L.push(`Roles: ${p.roles.map((r) => ROLE_LABELS[r]).join(", ")} · **Current:** ${cur ? `${STATUS_LABELS[cur.status]} (${formatDate(cur.date)})` : "no status"} · verified ${formatDate(p.status_verified)}`, "");
    if (p.status_history.length) {
      L.push("| Date | Track | Status | Note | Sources |", "|---|---|---|---|---|");
      for (const s of p.status_history) L.push(`| ${formatDate(s.date)} | ${s.track} | ${STATUS_LABELS[s.status]} | ${s.note ?? ""} | ${s.source_ids.join(", ")} |`);
      L.push("");
    }
    for (const c of p.clemency) L.push(`- **Clemency:** ${c.type} on ${formatDate(c.date)} by ${c.granted_by} [${c.source_ids.join(", ")}]`);
    for (const a of p.administrative_actions) L.push(`- **Administrative:** ${a.type} on ${formatDate(a.date)} [${a.source_ids.join(", ")}]`);
    if (p.clemency.length || p.administrative_actions.length) L.push("");
  }

  const money = MONEY_FIELDS.map((f) => [f, e.money[f]] as const).filter(([, v]) => v);
  if (money.length) {
    L.push("## Money", "", "| Measure | Amount | Basis | Sources |", "|---|---|---|---|");
    for (const [f, v] of money) L.push(`| ${MONEY_LABELS[f]}${"kind" in v! && v!.kind === "intended" ? " (intended)" : ""} | ${formatUSD(v!.amount)} | ${BASIS_LABELS[v!.basis]}${v!.note ? ` · ${v!.note}` : ""} | ${v!.source_ids.join(", ")} |`);
    L.push("");
  }

  const words = e.summary.trim().split(/\s+/).length;
  L.push(`## Summary (${words} words${words < 100 || words > 200 ? " — OUTSIDE 100–200" : ""})`, "", e.summary.trim(), "");

  L.push("## Sources", "");
  for (const sid of [...e.government_sources, ...e.news_sources]) {
    const s = src(ds, sid);
    if (!s) { L.push(`- ${sid} — MISSING`); continue; }
    const tf = s.text_file ? path.join(originDir(s, base), s.text_file) : null;
    const len = tf && fs.existsSync(tf) ? fs.statSync(tf).size : 0;
    L.push(`- \`${sid}\` ${s.publisher}, ${formatDate(s.date_published)}: ${s.title} — archive ${s.archive_status}${len ? `, text ${len} bytes` : ", NO TEXT"} — ${s.url}`);
  }
  L.push("");

  const problems = relatedFiles(ds, e).flatMap((f) => (issuesByFile.get(path.resolve(f)) ?? []).map((m) => `${path.relative(process.cwd(), f)}: ${m}`));
  L.push(`## Validation (${problems.length === 0 ? "clean" : `${problems.length} problem${problems.length === 1 ? "" : "s"}`})`, "");
  for (const p of problems) L.push(`- ${p}`);
  if (problems.length) L.push("");

  const notes = notesFor(e, ds);
  if (notes.length) { L.push("## Drafting notes mentioning this case", ""); for (const n of notes) L.push(`- ${n}`); L.push(""); }

  L.push("## Decision", "", "- [ ] Approve as is", "- [ ] Approve with edits (list them below)", "- [ ] Reject", "", "Edits:", "");
  return L.join("\n");
}

fs.mkdirSync(out, { recursive: true });
// Start from an empty folder so cards for events promoted or deleted since the last run do not linger.
for (const f of fs.readdirSync(out)) if (f.endsWith(".md")) fs.unlinkSync(path.join(out, f));
const drafts = dataset.events.filter((e) => originDir(e, base) === overlay);
const index: string[] = ["# Review index", "", `${drafts.length} draft events · generated ${new Date().toISOString().slice(0, 10)}`, "", "| Priority | Event | Case status | Participants | Validation | Card |", "|---|---|---|---|---|---|"];
for (const e of drafts) {
  const file = path.join(out, `${e.id}.md`);
  fs.writeFileSync(file, card(dataset, e));
  const problems = relatedFiles(dataset, e).reduce((n, f) => n + (issuesByFile.get(path.resolve(f))?.length ?? 0), 0);
  index.push(`| ${reviewPriority(e).priority} | ${e.title} | ${eventStatus(e)} | ${e.participants.length} | ${problems === 0 ? "clean" : `${problems} problems`} | [card](./${e.id}.md) |`);
}
const unattributed = issues.filter((i) => !drafts.some((e) => relatedFiles(dataset, e).some((f) => path.resolve(f) === path.resolve(i.file))));
if (unattributed.length) {
  index.push("", "## Other validation problems (files not tied to a draft event)", "");
  for (const i of unattributed) index.push(`- ${path.relative(process.cwd(), i.file)}: ${i.message}`);
}
fs.writeFileSync(path.join(out, "INDEX.md"), index.join("\n") + "\n");
console.log(`wrote ${drafts.length} cards and INDEX.md to ${path.relative(process.cwd(), out)}`);
