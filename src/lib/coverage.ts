/**
 * Coverage of this database against the Justice Department's own nationwide counts (SPEC.md §10.1).
 * "Ours" counts federal officials (people) in the database by the year of their first criminal charge,
 * which is the closest match to the Public Integrity Section's "charged" column. The two are not the
 * same measure: the Section's counts use a broader definition of public corruption.
 */
import type { Dataset } from "./load";
import { compareDates, isPersonId, yearOf } from "../schemas/common";

export interface CoverageRow {
  year: number;
  ours: number;
  national: number | null;
  percent: number | null;
}

/** Federal officials in the database, keyed by the year of their first criminal "charged" entry. */
export function officialsChargedByYear(ds: Dataset): Map<number, Set<string>> {
  const out = new Map<number, Set<string>>();
  for (const e of ds.events) {
    for (const p of e.participants) {
      if (p.actor_type !== "official" || !isPersonId(p.entity_id)) continue;
      const charges = p.status_history.filter((s) => s.track === "criminal" && s.status === "charged").map((s) => s.date).sort(compareDates);
      if (!charges.length) continue;
      const y = yearOf(charges[0]);
      if (!out.has(y)) out.set(y, new Set());
      out.get(y)!.add(p.entity_id);
    }
  }
  return out;
}

export function coverageRows(ds: Dataset, from = 2016): CoverageRow[] {
  const ours = officialsChargedByYear(ds);
  const nationalYears = Object.keys(ds.pin?.federal_officials ?? {}).map(Number);
  const years = [...new Set([...nationalYears, ...ours.keys()])].filter((y) => y >= from).sort((a, b) => a - b);
  return years.map((year) => {
    const n = ours.get(year)?.size ?? 0;
    const national = ds.pin?.federal_officials[String(year)]?.charged ?? null;
    return { year, ours: n, national, percent: national ? Math.round((1000 * n) / national) / 10 : null };
  });
}
