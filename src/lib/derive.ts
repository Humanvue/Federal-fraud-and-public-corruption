import { compareDates, isPersonId, normalizeDate } from "../schemas/common";
import type { Event, Participant, Status, StatusEntry, Track } from "../schemas/event";

// ---- Status derivation (SPEC.md §3.3) -------------------------------------

const TRACK_RANK: Record<Track, number> = { criminal: 3, civil: 2, administrative: 1 };

/** Statuses that end a participant's involvement for resolution-date purposes. */
export const RESOLVED_STATUSES: ReadonlySet<Status> = new Set<Status>([
  "sentenced",
  "acquitted",
  "dismissed",
  "overturned",
  "deferred_prosecution",
  "declined",
  "deceased",
  "settled_no_admission",
  "settled_with_admission",
  "judgment_against",
  "civil_dismissed",
  "finding_issued",
  "no_violation_found",
]);

/** For review priority, a plea or conviction already settles the legal-risk question. */
export const RESOLVED_FOR_REVIEW: ReadonlySet<Status> = new Set<Status>([
  ...RESOLVED_STATUSES,
  "pleaded_guilty",
  "convicted",
]);

/**
 * A declination means no criminal case exists, so it ranks below every other entry; otherwise the
 * track decides (criminal > civil > administrative).
 */
function rankOf(s: StatusEntry): number {
  return s.status === "declined" ? 0 : TRACK_RANK[s.track];
}

/** Latest entry on the participant's most advanced track (criminal > civil > administrative). */
export function currentStatus(p: Participant): StatusEntry | null {
  if (p.status_history.length === 0) return null;
  let best: StatusEntry | null = null;
  for (const s of p.status_history) {
    if (!best) {
      best = s;
      continue;
    }
    const rank = rankOf(s) - rankOf(best);
    if (rank > 0 || (rank === 0 && compareDates(s.date, best.date) >= 0)) best = s;
  }
  return best;
}

/** A pardon ends a prosecution, so a pardoned participant is resolved even before conviction. */
function pardoned(p: Participant): boolean {
  return p.clemency.some((c) => c.type === "pardon");
}

export function isResolved(p: Participant): boolean {
  const s = currentStatus(p);
  return s !== null && (RESOLVED_STATUSES.has(s.status) || pardoned(p));
}

export function isResolvedForReview(p: Participant): boolean {
  const s = currentStatus(p);
  return s !== null && (RESOLVED_FOR_REVIEW.has(s.status) || pardoned(p));
}

export type EventStatus = "pending" | "partially_resolved" | "resolved";

/** Only participants with a status history count; victim agencies and witnesses do not. */
function trackedParticipants(e: Event): Participant[] {
  return e.participants.filter((p) => p.status_history.length > 0);
}

export function eventStatus(e: Event): EventStatus {
  const tracked = trackedParticipants(e);
  if (tracked.length === 0) return "pending";
  const resolved = tracked.filter(isResolved).length;
  if (resolved === 0) return "pending";
  if (resolved === tracked.length) return "resolved";
  return "partially_resolved";
}

/** Date of the last participant resolution, or null unless every tracked participant is resolved. */
export function resolutionDate(e: Event): string | null {
  if (eventStatus(e) !== "resolved") return null;
  let latest: string | null = null;
  for (const p of trackedParticipants(e)) {
    const s = currentStatus(p)!;
    // A pre-conviction pardon resolves the participant on the pardon date.
    const pardon = !RESOLVED_STATUSES.has(s.status) ? p.clemency.find((c) => c.type === "pardon") : undefined;
    const d = pardon?.date ?? s.date;
    if (!latest || compareDates(d, latest) > 0) latest = d;
  }
  return latest;
}

export type ActorMix = "officials_only" | "contractors_only" | "private_only" | "mixed";

export function actorMix(e: Event): ActorMix {
  const types = new Set(e.participants.filter((p) => !p.roles.includes("victim_agency")).map((p) => p.actor_type));
  if (types.size === 1) {
    const t = [...types][0];
    return t === "official" ? "officials_only" : t === "contractor" ? "contractors_only" : "private_only";
  }
  return "mixed";
}

// ---- Review priority (SPEC.md §7.2) ---------------------------------------

export interface ReviewContext {
  isCorrection?: boolean;
  checksFailed?: boolean;
  /** Statuses this change moves any participant to (for status-update items). */
  statusesChangedTo?: Status[];
  clemencyAdded?: boolean;
}

const HIGH_RISK_TRANSITIONS: ReadonlySet<Status> = new Set<Status>([
  "acquitted",
  "dismissed",
  "overturned",
  "mistrial",
  "no_violation_found",
]);

export type ReviewPriority = "high" | "normal";

export function reviewPriority(e: Event, ctx: ReviewContext = {}): { priority: ReviewPriority; reasons: string[] } {
  const reasons: string[] = [];
  for (const p of e.participants) {
    if (isPersonId(p.entity_id) && p.status_history.length > 0 && !isResolvedForReview(p)) {
      reasons.push(`names an individual with unresolved status: ${p.entity_id}`);
    }
  }
  if (ctx.isCorrection) reasons.push("is a correction");
  if (ctx.checksFailed) reasons.push("an automated check failed");
  for (const s of ctx.statusesChangedTo ?? []) {
    if (HIGH_RISK_TRANSITIONS.has(s)) reasons.push(`changes a status to ${s}`);
  }
  if (ctx.clemencyAdded) reasons.push("adds clemency");
  return { priority: reasons.length > 0 ? "high" : "normal", reasons };
}

// ---- Staleness (SPEC.md §7.4) ---------------------------------------------

export interface StalenessOptions {
  verifyMonths?: number;
  hideMonths?: number;
}

export interface StalenessTask {
  event_id: string;
  entity_id: string;
  months_since_verified: number;
  action: "verify" | "hide";
}

export function monthsBetween(from: string, to: string): number {
  const a = normalizeDate(from);
  const b = normalizeDate(to);
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  let months = (by - ay) * 12 + (bm - am);
  if (bd < ad) months -= 1;
  return months;
}

/** Unresolved named individuals whose status has not been verified recently. */
export function stalenessTasks(e: Event, today: string, opts: StalenessOptions = {}): StalenessTask[] {
  const verifyMonths = opts.verifyMonths ?? 12;
  const hideMonths = opts.hideMonths ?? 18;
  const tasks: StalenessTask[] = [];
  for (const p of e.participants) {
    if (!isPersonId(p.entity_id) || p.status_history.length === 0 || isResolved(p)) continue;
    const months = monthsBetween(p.status_verified, today);
    if (months >= hideMonths) tasks.push({ event_id: e.id, entity_id: p.entity_id, months_since_verified: months, action: "hide" });
    else if (months >= verifyMonths) tasks.push({ event_id: e.id, entity_id: p.entity_id, months_since_verified: months, action: "verify" });
  }
  return tasks;
}

/** True when the event should be excluded from Story charts until re-verified. */
export function hiddenFromCharts(e: Event, today: string, opts: StalenessOptions = {}): boolean {
  return stalenessTasks(e, today, opts).some((t) => t.action === "hide");
}
