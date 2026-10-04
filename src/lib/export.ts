/**
 * Data downloads (SPEC.md §10.6): CSV tables and one JSON file, rebuilt on every
 * deploy. Raw records are published as stored; derived values (current status,
 * case status, inflation-adjusted money) are added alongside, never mixed in.
 */
import type { Dataset } from "./load";
import { actorMix, currentStatus, eventStatus, isResolved, resolutionDate } from "./derive";
import { adjustForInflation } from "./inflation";
import { apaCitation } from "./cite";
import { entityNameIn, moneyYearOf } from "./rows";
import { MONEY_FIELDS } from "../schemas/event";

export type Cell = string | number | boolean | null | undefined;
export type Table = { columns: string[]; rows: Cell[][] };

const DANGEROUS = /^[=+\-@\t\r]/;

/** RFC 4180 CSV. Text that a spreadsheet would run as a formula is prefixed with an apostrophe. */
export function toCSV(t: Table): string {
  const cell = (v: Cell): string => {
    if (v === null || v === undefined) return "";
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    let s = String(v);
    if (DANGEROUS.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [t.columns, ...t.rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

const join = (xs: (string | null | undefined)[]) => xs.filter(Boolean).join("; ");

export function casesTable(ds: Dataset): Table {
  const moneyCols = MONEY_FIELDS.flatMap((f) => [`${f}_amount`, `${f}_basis`]);
  const columns = [
    "id", "title", "page", "primary_category", "categories", "actor_mix", "case_status",
    "first_public_action", "conduct_start", "conduct_end", "resolution_date",
    "agencies", "investigating_agencies", "prosecuting_office", "court_cases", "participant_count",
    "money_year", ...moneyCols, "qui_tam", "government_source_ids", "tags",
    "reviewed_by", "reviewed_at", "ai_assisted", "last_updated", "summary",
  ];
  const rows = ds.events.map((e) => [
    e.id, e.title, `/cases/${e.id}/`, e.categories[0], e.categories.join("; "), actorMix(e), eventStatus(e),
    e.dates.first_public_action, e.dates.conduct_start, e.dates.conduct_end, resolutionDate(e),
    join(e.agencies.map((id) => entityNameIn(ds, id))),
    join(e.investigating_agencies.map((id) => entityNameIn(ds, id))),
    e.prosecuting_office ? entityNameIn(ds, e.prosecuting_office) : null,
    join(e.court_cases.map((c) => `${c.court} ${c.docket ?? "(docket not confirmed)"}`)),
    e.participants.filter((p) => !p.roles.includes("victim_agency")).length,
    moneyYearOf(e),
    ...MONEY_FIELDS.flatMap((f) => [e.money[f]?.amount ?? null, e.money[f]?.basis ?? null]),
    e.qui_tam, e.government_sources.join("; "), e.tags.join("; "),
    e.review.reviewed_by, e.review.reviewed_at, e.review.ai_assisted, e.last_updated,
    e.summary.trim().replace(/\s+/g, " "),
  ]);
  return { columns, rows };
}

export function participantsTable(ds: Dataset): Table {
  const columns = [
    "event_id", "entity_id", "entity_type", "name", "actor_type", "roles", "position",
    "current_status", "current_status_date", "current_status_track", "resolved",
    "clemency", "administrative_actions", "status_verified", "party_affiliation",
  ];
  const rows: Cell[][] = [];
  for (const e of ds.events) for (const p of e.participants) {
    const cur = currentStatus(p);
    const person = ds.people.find((x) => x.id === p.entity_id);
    rows.push([
      e.id, p.entity_id, p.entity_id.startsWith("per-") ? "person" : "organization", entityNameIn(ds, p.entity_id),
      p.actor_type, p.roles.join("; "), p.position ?? null,
      cur?.status ?? null, cur?.date ?? null, cur?.track ?? null, p.status_history.length ? isResolved(p) : null,
      join(p.clemency.map((c) => `${c.type} ${c.date}`)), join(p.administrative_actions.map((a) => `${a.type} ${a.date}`)),
      p.status_verified, person?.party_affiliation.value ?? null,
    ]);
  }
  return { columns, rows };
}

export function statusHistoryTable(ds: Dataset): Table {
  const columns = ["event_id", "entity_id", "name", "sequence", "date", "track", "status", "note", "source_ids"];
  const rows: Cell[][] = [];
  for (const e of ds.events) for (const p of e.participants) {
    p.status_history.forEach((s, i) => rows.push([e.id, p.entity_id, entityNameIn(ds, p.entity_id), i + 1, s.date, s.track, s.status, s.note ?? null, s.source_ids.join("; ")]));
  }
  return { columns, rows };
}

export function moneyTable(ds: Dataset): Table {
  const base = ds.cpi?.base_year ?? null;
  const columns = ["event_id", "measure", "amount", "basis", "kind", "money_year", "adjusted_amount", "adjusted_base_year", "note", "source_ids"];
  const rows: Cell[][] = [];
  for (const e of ds.events) {
    const y = moneyYearOf(e);
    for (const f of MONEY_FIELDS) {
      const m = e.money[f];
      if (!m) continue;
      const adj = ds.cpi && String(y) in ds.cpi.values ? adjustForInflation(m.amount, y, ds.cpi) : null;
      rows.push([e.id, f, m.amount, m.basis, "kind" in m ? m.kind : null, y, adj, adj === null ? null : base, m.note ?? null, m.source_ids.join("; ")]);
    }
  }
  return { columns, rows };
}

export function peopleTable(ds: Dataset): Table {
  const columns = ["id", "name", "aliases", "party_affiliation", "party_basis", "positions", "page"];
  const rows = ds.people.map((p) => [
    p.id, p.name, p.aliases.join("; "), p.party_affiliation.value, p.party_affiliation.basis,
    join(p.positions.map((x) => `${x.title}, ${entityNameIn(ds, x.org_id)} (${x.start ?? "?"} to ${x.end ?? "present"})`)),
    `/people/${p.id}/`,
  ]);
  return { columns, rows };
}

export function organizationsTable(ds: Dataset): Table {
  const columns = ["id", "name", "org_type", "parent_org_id", "parent_name", "uei", "page"];
  const rows = ds.organizations.map((o) => [o.id, o.name, o.org_type, o.parent_org_id, o.parent_org_id ? entityNameIn(ds, o.parent_org_id) : null, o.uei, `/organizations/${o.id}/`]);
  return { columns, rows };
}

export function sourcesTable(ds: Dataset): Table {
  const columns = ["id", "source_type", "publisher", "title", "date_published", "url", "archive_url", "archive_status", "accessed", "report_number", "apa_citation", "page"];
  const rows = ds.sources.map((s) => [s.id, s.source_type, s.publisher, s.title, s.date_published, s.url, s.archive_url, s.archive_status, s.accessed, s.report_number, apaCitation(s), `/sources/${s.id}/`]);
  return { columns, rows };
}

export const TABLES = {
  "cases.csv": { build: casesTable, description: "One row per case: dates, categories, case status, agencies, courts, money by measure with its basis, and the summary." },
  "participants.csv": { build: participantsTable, description: "One row per person or organization in each case, with their current status, clemency, and administrative actions." },
  "status-history.csv": { build: statusHistoryTable, description: "Every dated status entry for every participant, with sources." },
  "money.csv": { build: moneyTable, description: "One row per stated dollar figure: measure, amount, basis, and the CPI-U adjusted amount." },
  "people.csv": { build: peopleTable, description: "Everyone named in a case, with positions and, for elected officials, party affiliation." },
  "organizations.csv": { build: organizationsTable, description: "Agencies, offices, companies, and courts, with parent organizations." },
  "sources.csv": { build: sourcesTable, description: "Every government and court source, with original and archived links and an APA citation." },
} as const;

export type TableName = keyof typeof TABLES;

/** The complete dataset as one JSON document: raw records plus a separate `derived` block per event. */
export function datasetJson(ds: Dataset, generated: string) {
  return {
    title: "Federal Fraud and Public Corruption Tracker dataset",
    generated,
    license: "CC BY 4.0 (data and written text); government and court documents are public domain",
    cpi_u: ds.cpi,
    events: ds.events.map((e) => ({
      ...e,
      derived: {
        case_status: eventStatus(e),
        resolution_date: resolutionDate(e),
        actor_mix: actorMix(e),
        participants: e.participants.map((p) => {
          const c = currentStatus(p);
          return { entity_id: p.entity_id, current_status: c?.status ?? null, current_status_date: c?.date ?? null, resolved: p.status_history.length ? isResolved(p) : null };
        }),
      },
    })),
    people: ds.people,
    organizations: ds.organizations,
    contracts: ds.contracts,
    sources: ds.sources,
    corrections: ds.corrections,
  };
}
