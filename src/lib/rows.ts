/**
 * Build-time projection of events into flat rows for the Explore table and the
 * downloads. Runs on the server only (it uses the derive helpers and CPI data).
 */
import type { Dataset } from "./load";
import { actorMix, currentStatus, eventStatus, resolutionDate, isResolved } from "./derive";
import { adjustForInflation } from "./inflation";
import { CATEGORY_LABELS, STATUS_LABELS, STATUS_TONE } from "./format";
import { yearOf } from "../schemas/common";
import { MONEY_FIELDS, type Event } from "../schemas/event";
import type { ExploreRow, MoneyCell } from "./explore";

export function entityNameIn(ds: Dataset, id: string): string {
  return ds.people.find((p) => p.id === id)?.name ?? ds.organizations.find((o) => o.id === id)?.name ?? id;
}

export function moneyYearOf(e: Event): number {
  return e.money_year ?? yearOf(e.dates.first_public_action);
}

export function buildRow(ds: Dataset, e: Event): ExploreRow {
  const year = moneyYearOf(e);
  const cpi = ds.cpi;
  const money: Record<string, MoneyCell> = {};
  for (const f of MONEY_FIELDS) {
    const m = e.money[f];
    if (!m) continue;
    const canAdjust = !!cpi && String(year) in cpi.values;
    money[f] = {
      nominal: m.amount,
      adjusted: canAdjust ? adjustForInflation(m.amount, year, cpi!) : null,
      basis: m.basis,
    };
  }
  // The table lists people and organizations with a recorded status. Anyone named without one (an
  // affected agency, an uncharged company) still appears with their role on the case page.
  const withStatus = e.participants.filter((p) => !p.roles.includes("victim_agency") && p.status_history.length > 0);
  const participants = (withStatus.length ? withStatus : e.participants.filter((p) => !p.roles.includes("victim_agency")))
    .map((p) => {
      const cur = currentStatus(p);
      return {
        name: entityNameIn(ds, p.entity_id),
        href: p.entity_id.startsWith("per-") ? `/people/${p.entity_id}/` : `/organizations/${p.entity_id}/`,
        status: cur?.status ?? null,
        statusLabel: cur ? STATUS_LABELS[cur.status] : "No status recorded",
        tone: cur ? STATUS_TONE[cur.status] : "neutral",
        date: cur?.date ?? null,
        resolved: isResolved(p),
        pardoned: p.clemency.some((c) => c.type === "pardon"),
        commuted: p.clemency.some((c) => c.type === "commutation"),
      };
    });
  const agencies = e.agencies.map((id) => ({ id, name: entityNameIn(ds, id) }));
  return {
    id: e.id,
    title: e.title,
    href: `/cases/${e.id}/`,
    categories: e.categories,
    categoryLabels: e.categories.map((c) => CATEGORY_LABELS[c]),
    primaryCategory: e.categories[0],
    actorMix: actorMix(e),
    eventStatus: eventStatus(e),
    dates: {
      conduct_start: e.dates.conduct_start,
      first_public_action: e.dates.first_public_action,
      resolution: resolutionDate(e),
    },
    agencies,
    participants,
    money,
    moneyYear: year,
    text: [e.title, e.summary, ...participants.map((p) => p.name), ...agencies.map((a) => a.name), ...e.tags]
      .join(" ")
      .toLowerCase(),
  };
}

export function buildRows(ds: Dataset): ExploreRow[] {
  return ds.events.map((e) => buildRow(ds, e));
}
