import { validateDir } from "./validate";
import type { Dataset } from "./load";
import type { Event, Person, Organization, Source, Contract } from "../schemas";

/**
 * Build-time data access for Astro pages. The directory defaults to `data/`;
 * set DATA_DIR=tests/fixtures/valid to preview the site with the fictional fixture.
 * The build fails if validation fails (SPEC.md §4.8).
 */
let cached: Dataset | null = null;

export function dataDir(): string {
  return process.env.DATA_DIR ?? "data";
}

export function getData(): Dataset {
  if (cached) return cached;
  const { dataset, issues } = validateDir(dataDir());
  if (issues.length > 0) {
    const lines = issues.map((i) => `${i.file}: ${i.message}`).join("\n");
    throw new Error(`Data validation failed (${issues.length} problems):\n${lines}`);
  }
  cached = dataset;
  return dataset;
}

export function eventById(id: string): Event | undefined {
  return getData().events.find((e) => e.id === id);
}
export function personById(id: string): Person | undefined {
  return getData().people.find((p) => p.id === id);
}
export function orgById(id: string): Organization | undefined {
  return getData().organizations.find((o) => o.id === id);
}
export function sourceById(id: string): Source | undefined {
  return getData().sources.find((s) => s.id === id);
}
export function contractById(id: string): Contract | undefined {
  return getData().contracts.find((c) => c.id === id);
}

export function entityName(id: string): string {
  return personById(id)?.name ?? orgById(id)?.name ?? id;
}

export function entityHref(id: string): string {
  return id.startsWith("per-") ? `/people/${id}/` : `/organizations/${id}/`;
}

export function eventsForEntity(id: string): Event[] {
  return getData().events.filter(
    (e) =>
      e.participants.some((p) => p.entity_id === id) ||
      e.agencies.includes(id) ||
      e.investigating_agencies.includes(id) ||
      e.prosecuting_office === id,
  );
}

export function subsidiariesOf(orgId: string): Organization[] {
  return getData().organizations.filter((o) => o.parent_org_id === orgId);
}
