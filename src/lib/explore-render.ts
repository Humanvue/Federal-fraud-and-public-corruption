/** Table-row HTML for the Explore page, used by the server render and the browser re-render. */
import { escapeHtml as h, type DateBasis, type ExploreRow, type FilterState } from "./explore";
import { formatDate, formatUSD } from "./format";

export const ACTOR_MIX_LABELS: Record<string, string> = {
  officials_only: "Officials only",
  contractors_only: "Contractors only",
  private_only: "Private parties only",
  mixed: "Mixed",
};

export const EVENT_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  partially_resolved: "Partially resolved",
  resolved: "Resolved",
};

export const DATE_BASIS_LABELS: Record<DateBasis, string> = {
  first_public_action: "First official action",
  conduct_start: "Conduct began",
  resolution: "Resolved",
};

function participantsCell(r: ExploreRow): string {
  const max = 4;
  const items = r.participants.slice(0, max).map((p) => {
    const extra = p.pardoned ? " · pardoned" : p.commuted ? " · commuted" : "";
    return `<li><a href="${h(p.href)}">${h(p.name)}</a> <span class="badge badge-${h(p.tone)}">${h(p.statusLabel)}${extra}</span></li>`;
  });
  const more = r.participants.length > max ? `<li class="muted small">and ${r.participants.length - max} more</li>` : "";
  return `<ul class="plain">${items.join("")}${more}</ul>`;
}

function moneyCell(r: ExploreRow, s: FilterState): string {
  const c = r.money[s.measure];
  if (!c) return `<span class="muted">none stated</span>`;
  const shown = c.adjusted ?? c.nominal;
  const note = c.adjusted === null ? ` <span class="muted small">(${r.moneyYear} dollars)</span>` : "";
  const cls = c.basis === "alleged" && !s.alleged ? "muted" : "";
  return `<span class="${cls}">${formatUSD(shown)}</span>${note}<br><span class="small muted">${h(c.basis)}</span>`;
}

export function rowHtml(r: ExploreRow, s: FilterState): string {
  const date = r.dates[s.basis];
  return (
    `<tr>` +
    `<td data-label="${h(DATE_BASIS_LABELS[s.basis])}">${date ? h(formatDate(date)) : '<span class="muted">none</span>'}</td>` +
    `<td data-label="Case"><a href="${h(r.href)}">${h(r.title)}</a><div class="small muted">${h(r.categoryLabels.join(" · "))}</div></td>` +
    `<td data-label="People and organizations">${participantsCell(r)}</td>` +
    `<td data-label="Case status">${h(EVENT_STATUS_LABELS[r.eventStatus])}</td>` +
    `<td data-label="Money">${moneyCell(r, s)}</td>` +
    `</tr>`
  );
}
