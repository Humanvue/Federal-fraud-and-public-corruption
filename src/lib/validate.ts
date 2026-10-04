import fs from "node:fs";
import path from "node:path";
import { ID_PATTERNS } from "../schemas/common";
import { Tiers } from "../schemas/reference";
import { parse as parseYaml } from "yaml";
import { MONEY_FIELDS, type Event } from "../schemas/event";
import { loadDataset, originDir, type Dataset, type Issue } from "./load";
import { BANNED_STATUS_PHRASES, BANNED_WORDS } from "./rules";

export interface ValidateOptions {
  /** Base data directory; records from overlays carry their own origin. */
  dir: string;
}

const NUMBER_RE = /\$?\d[\d,]*(?:\.\d+)?(?:\s*(?:million|billion|thousand))?/gi;
const SCALE: Record<string, number> = { thousand: 1e3, million: 1e6, billion: 1e9 };

/** Strings that would count as the number appearing in a source text. */
export function numberCandidates(token: string): string[] {
  const scaleMatch = /(thousand|million|billion)$/i.exec(token.trim());
  const scale = scaleMatch?.[1]?.toLowerCase();
  const numeric = token.replace(/[$,]/g, "").replace(/\s*(thousand|million|billion)$/i, "").trim();
  const out = new Set<string>([numeric]);
  if (scale) {
    out.add(`${numeric} ${scale}`);
    const expanded = Math.round(parseFloat(numeric) * SCALE[scale]);
    if (Number.isFinite(expanded)) out.add(String(expanded));
  }
  return [...out];
}

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[$,]/g, "").replace(/\s+/g, " ");
}

/** Numbers in `summary` that do not appear in any of `texts`. */
export function missingNumbers(summary: string, texts: string[]): string[] {
  const corpus = texts.map(normalizeText).join("\n");
  const missing: string[] = [];
  for (const m of summary.matchAll(NUMBER_RE)) {
    const token = m[0];
    if (!/\d/.test(token)) continue;
    const found = numberCandidates(token).some((c) => corpus.includes(c.toLowerCase()));
    if (!found) missing.push(token.trim());
  }
  return [...new Set(missing)];
}

function containsPhrase(text: string, phrases: readonly string[]): string[] {
  const t = text.toLowerCase();
  return phrases.filter((p) => new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(t));
}

function* allSourceIdLists(e: Event): Generator<[string, string[]]> {
  for (const c of e.court_cases) yield ["court_cases", c.source_ids];
  for (const r of e.relationships) yield ["relationships", r.source_ids];
  for (const f of MONEY_FIELDS) {
    const m = e.money[f];
    if (m) yield [`money.${f}`, m.source_ids];
  }
  for (let i = 0; i < e.participants.length; i++) {
    const p = e.participants[i];
    for (const s of p.status_history) yield [`participants[${i}].status_history`, s.source_ids];
    for (const a of p.administrative_actions) yield [`participants[${i}].administrative_actions`, a.source_ids];
    for (const c of p.clemency) yield [`participants[${i}].clemency`, c.source_ids];
  }
}

export function validateDataset(ds: Dataset, opts: ValidateOptions): Issue[] {
  const issues: Issue[] = [];
  const root = path.resolve(opts.dir);
  const fileOf = (item: object, kind: string, id: string) => path.join(originDir(item, root), kind, `${id}.yaml`);
  const eventFile = (e: Event) => fileOf(e, "events", e.id);

  const eventIds = new Set(ds.events.map((e) => e.id));
  const personIds = new Set(ds.people.map((p) => p.id));
  const orgIds = new Set(ds.organizations.map((o) => o.id));
  const contractIds = new Set(ds.contracts.map((c) => c.id));
  const sourceById = new Map(ds.sources.map((s) => [s.id, s]));

  const need = (file: string, kind: string, id: string | null | undefined, set: Set<string> | Map<string, unknown>, where: string) => {
    if (id && !set.has(id)) issues.push({ file, message: `${where}: unknown ${kind} ${id}` });
  };

  // ---- Sources ----
  const sourceTexts = new Map<string, string>();
  for (const s of ds.sources) {
    const file = fileOf(s, "sources", s.id);
    need(file, "organization", s.publisher_org_id, orgIds, "publisher_org_id");
    // Court docket entries whose host blocks the Wayback Machine may be marked "blocked": their docket
    // text is stored verbatim in text_file and PACER remains the authoritative record (SPEC.md §4.5).
    const blockedDocket = s.source_type === "court" && s.archive_status === "blocked" && !!s.text_file;
    if ((s.source_type === "government" || s.source_type === "court") && !blockedDocket && (!s.archive_url || s.archive_status !== "ok")) {
      issues.push({ file, message: "archive_url: government and court sources require a working archive (run npm run rearchive)" });
    }
    if (s.text_file) {
      const tf = path.join(originDir(s, root), s.text_file);
      if (!fs.existsSync(tf)) issues.push({ file, message: `text_file not found: ${s.text_file}` });
      else sourceTexts.set(s.id, fs.readFileSync(tf, "utf8"));
    }
  }

  // ---- People, organizations, contracts ----
  for (const p of ds.people) {
    const file = fileOf(p, "people", p.id);
    for (const pos of p.positions) {
      need(file, "organization", pos.org_id, orgIds, "positions.org_id");
      for (const sid of pos.source_ids) need(file, "source", sid, sourceById, "positions.source_ids");
    }
    for (const sid of p.party_affiliation.source_ids) need(file, "source", sid, sourceById, "party_affiliation.source_ids");
  }
  for (const o of ds.organizations) {
    const file = fileOf(o, "organizations", o.id);
    need(file, "organization", o.parent_org_id, orgIds, "parent_org_id");
    if (o.parent_org_id === o.id) issues.push({ file, message: "an organization cannot be its own parent" });
  }
  for (const c of ds.contracts) {
    const file = fileOf(c, "contracts", c.id);
    need(file, "organization", c.awarding_agency_id, orgIds, "awarding_agency_id");
    need(file, "organization", c.recipient_org_id, orgIds, "recipient_org_id");
    for (const sid of c.source_ids) need(file, "source", sid, sourceById, "source_ids");
  }

  // ---- Events ----
  for (const e of ds.events) {
    const file = eventFile(e);

    for (const id of e.agencies) need(file, "organization", id, orgIds, "agencies");
    for (const id of e.investigating_agencies) need(file, "organization", id, orgIds, "investigating_agencies");
    need(file, "organization", e.prosecuting_office, orgIds, "prosecuting_office");
    for (const id of e.contracts) need(file, "contract", id, contractIds, "contracts");
    for (const id of e.related_events) {
      need(file, "event", id, eventIds, "related_events");
      if (id === e.id) issues.push({ file, message: "related_events must not include the event itself" });
    }
    for (const r of e.relationships) {
      for (const id of [r.from, r.to]) {
        if (!(ID_PATTERNS.person.test(id) ? personIds.has(id) : orgIds.has(id))) {
          issues.push({ file, message: `relationships: unknown entity ${id}` });
        }
      }
    }
    for (const p of e.participants) {
      const ok = ID_PATTERNS.person.test(p.entity_id) ? personIds.has(p.entity_id) : orgIds.has(p.entity_id);
      if (!ok) issues.push({ file, message: `participants: unknown entity ${p.entity_id}` });
    }

    for (const sid of e.government_sources) {
      const s = sourceById.get(sid);
      if (!s) issues.push({ file, message: `government_sources: unknown source ${sid}` });
      else if (s.source_type === "news") issues.push({ file, message: `government_sources: ${sid} is a news source` });
    }
    for (const sid of e.news_sources) {
      const s = sourceById.get(sid);
      if (!s) issues.push({ file, message: `news_sources: unknown source ${sid}` });
      else if (s.source_type !== "news") issues.push({ file, message: `news_sources: ${sid} is not a news source` });
    }
    for (const [where, ids] of allSourceIdLists(e)) {
      for (const sid of ids) need(file, "source", sid, sourceById, where);
    }

    // A declination means no case was filed, so it does not by itself require a court case.
    const hasCourtTrack = e.participants.some((p) => p.status_history.some((s) => s.track !== "administrative" && s.status !== "declined"));
    if (hasCourtTrack && e.court_cases.length === 0) {
      issues.push({ file, message: "court_cases is required when any participant has a criminal or civil track" });
    }

    for (const w of containsPhrase(`${e.title}\n${e.summary}`, BANNED_WORDS)) {
      issues.push({ file, message: `banned word in title or summary: "${w}"` });
    }
    for (const w of containsPhrase(e.summary, BANNED_STATUS_PHRASES)) {
      issues.push({ file, message: `summary states a status ("${w}"); status is rendered from data, not prose` });
    }

    const texts = e.government_sources.map((sid) => sourceTexts.get(sid)).filter((t): t is string => t !== undefined);
    if (texts.length > 0) {
      for (const n of missingNumbers(e.summary, texts)) {
        issues.push({ file, message: `number "${n}" in summary does not appear in any cited government source text` });
      }
    }
  }

  // ---- Tier definitions (names never belong in this file) ----
  const tierFile = path.join(root, "reference", "tiers.yaml");
  if (fs.existsSync(tierFile)) {
    const parsed = Tiers.safeParse(parseYaml(fs.readFileSync(tierFile, "utf8")));
    if (!parsed.success) issues.push({ file: tierFile, message: `invalid tiers file: ${parsed.error.issues[0]?.message}` });
  }

  // ---- Reference data ----
  if (ds.pin) {
    const pinFile = path.join(root, "reference", "pin-statistics.yaml");
    for (const sid of ds.pin.source_ids) need(pinFile, "source", sid, sourceById, "source_ids");
  }

  // ---- Corrections ----
  const corrFile = path.join(root, "corrections", "corrections.yaml");
  for (const c of ds.corrections) {
    need(corrFile, "event", c.event_id, eventIds, "event_id");
    for (const sid of c.source_ids) need(corrFile, "source", sid, sourceById, "source_ids");
  }

  return issues;
}

/** Validates one directory, or overlays followed by the base directory (e.g. ["drafts", "data"]). */
export function validateDir(dir: string | string[]): { issues: Issue[]; dataset: Dataset } {
  const dirs = Array.isArray(dir) ? dir : [dir];
  const { dataset, issues } = loadDataset(dirs);
  return { dataset, issues: [...issues, ...validateDataset(dataset, { dir: dirs[dirs.length - 1] })] };
}
