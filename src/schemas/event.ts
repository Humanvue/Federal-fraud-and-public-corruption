import { z } from "zod";
import {
  ContractId,
  DateString,
  EntityId,
  EventId,
  LossEntry,
  MoneyEntry,
  OrgId,
  SourceId,
  SourceIds,
  compareDates,
  yearOf,
} from "./common";

// ---- Enumerations (SPEC.md §2, §3) ----------------------------------------
export const Category = z.enum([
  "bribery_kickbacks",
  "conflict_of_interest_ethics",
  "embezzlement_theft",
  "false_statements_obstruction",
  "procurement_fraud",
  "grant_fraud",
  "hatch_act",
  "healthcare_fraud",
  "pandemic_relief_fraud",
  "other",
]);
export type Category = z.infer<typeof Category>;

/** Categories that are off by default in charts and totals. */
export const OFF_BY_DEFAULT_CATEGORIES: ReadonlySet<Category> = new Set([
  "hatch_act",
  "healthcare_fraud",
  "pandemic_relief_fraud",
]);

export const ActorType = z.enum(["official", "contractor", "private"]);
export type ActorType = z.infer<typeof ActorType>;

export const Role = z.enum([
  "defendant",
  "briber",
  "bribe_recipient",
  "co_conspirator",
  "relator",
  "cooperating_witness",
  "subject_of_finding",
  "victim_agency",
]);
export type Role = z.infer<typeof Role>;

export const CriminalStatus = z.enum([
  "charged",
  "pleaded_guilty",
  "convicted",
  "sentenced",
  "acquitted",
  "dismissed",
  "partially_dismissed",
  "mistrial",
  "appeal_pending",
  "overturned",
  "deferred_prosecution",
  "declined",
  "deceased",
  "fugitive",
]);
export const CivilStatus = z.enum([
  "civil_complaint_filed",
  "settled_no_admission",
  "settled_with_admission",
  "judgment_against",
  "civil_dismissed",
]);
export const AdministrativeStatus = z.enum(["finding_issued", "no_violation_found"]);

export type Track = "criminal" | "civil" | "administrative";
export type Status =
  | z.infer<typeof CriminalStatus>
  | z.infer<typeof CivilStatus>
  | z.infer<typeof AdministrativeStatus>;

const statusEntryBase = {
  date: DateString,
  source_ids: SourceIds,
  note: z.string().optional(),
};

export const StatusEntry = z.discriminatedUnion("track", [
  z.strictObject({ track: z.literal("criminal"), status: CriminalStatus, ...statusEntryBase }),
  z.strictObject({ track: z.literal("civil"), status: CivilStatus, ...statusEntryBase }),
  z.strictObject({ track: z.literal("administrative"), status: AdministrativeStatus, ...statusEntryBase }),
]);
export type StatusEntry = z.infer<typeof StatusEntry>;

export const AdministrativeAction = z.strictObject({
  type: z.enum(["suspension", "debarment", "removal_from_office", "resignation", "security_clearance_revoked"]),
  date: DateString,
  source_ids: SourceIds,
  note: z.string().optional(),
});

export const Clemency = z.strictObject({
  type: z.enum(["pardon", "commutation"]),
  date: DateString,
  granted_by: z.string().min(1),
  source_ids: SourceIds,
  note: z.string().optional(),
});

export const Participant = z.strictObject({
  entity_id: EntityId,
  actor_type: ActorType,
  roles: z.array(Role).min(1),
  position: z.string().optional(),
  status_history: z.array(StatusEntry).default([]),
  administrative_actions: z.array(AdministrativeAction).default([]),
  clemency: z.array(Clemency).default([]),
  status_verified: DateString,
});
export type Participant = z.infer<typeof Participant>;

export const CourtCase = z.strictObject({
  court: z.string().min(1),
  docket: z.string().min(1),
  courtlistener_id: z.union([z.string(), z.number().int()]).nullable().default(null),
  source_ids: SourceIds,
});

export const RelationshipType = z.enum([
  "co_conspirator_with",
  "paid_bribe_to",
  "received_bribe_from",
  "employed_by",
  "official_of",
  "awarded_contract_to",
  "subsidiary_of",
  "investigated_by",
  "whistleblower_in",
  "family_of",
  "associate_of",
]);

export const Relationship = z.strictObject({
  from: EntityId,
  to: EntityId,
  type: RelationshipType,
  source_ids: SourceIds,
  note: z.string().optional(),
});

export const Money = z.strictObject({
  loss_to_government: LossEntry.nullable().default(null),
  bribe_or_kickback: MoneyEntry.nullable().default(null),
  contract_value_involved: MoneyEntry.nullable().default(null),
  settlement_amount: MoneyEntry.nullable().default(null),
  restitution_ordered: MoneyEntry.nullable().default(null),
  fines: MoneyEntry.nullable().default(null),
  forfeiture: MoneyEntry.nullable().default(null),
  whistleblower_share: MoneyEntry.nullable().default(null),
});
export type Money = z.infer<typeof Money>;
export const MONEY_FIELDS = Object.keys(Money.shape) as (keyof Money)[];

export const Review = z.strictObject({
  reviewed_by: z.string().nullable(),
  reviewed_at: DateString.nullable(),
  ai_assisted: z.boolean(),
  summary_stale: z.boolean().default(false),
});

/**
 * Event (SPEC.md §4.1). Objects are strict, so stored computed fields such as
 * current_status, event_status, resolved, requires_human_review or actor_type
 * on the event are rejected by the schema itself.
 */
export const Event = z
  .strictObject({
    id: EventId,
    title: z.string().min(1),
    categories: z.array(Category).min(1),
    agencies: z.array(OrgId).default([]),
    investigating_agencies: z.array(OrgId).default([]),
    prosecuting_office: OrgId.nullable().default(null),
    court_cases: z.array(CourtCase).default([]),
    jurisdiction_note: z.string().nullable().default(null),
    summary: z.string().min(1),
    dates: z.strictObject({
      conduct_start: DateString.nullable(),
      conduct_end: DateString.nullable(),
      first_public_action: DateString,
    }),
    money: Money,
    money_year: z.number().int().min(1990).max(2100).optional(),
    money_year_note: z.string().optional(),
    participants: z.array(Participant).min(1),
    contracts: z.array(ContractId).default([]),
    qui_tam: z.boolean().default(false),
    related_events: z.array(EventId).default([]),
    relationships: z.array(Relationship).default([]),
    government_sources: z.array(SourceId).min(1, "every event needs at least one government source"),
    news_sources: z.array(SourceId).default([]),
    tags: z.array(z.string()).default([]),
    review: Review,
    last_updated: DateString,
  })
  .superRefine((e, ctx) => {
    const fpaYear = yearOf(e.dates.first_public_action);
    const idYear = Number(e.id.slice(4, 8));
    if (idYear !== fpaYear) {
      ctx.addIssue({
        code: "custom",
        path: ["id"],
        message: `event id year ${idYear} must match first_public_action year ${fpaYear}`,
      });
    }
    if (e.money_year !== undefined && e.money_year !== fpaYear && !e.money_year_note) {
      ctx.addIssue({
        code: "custom",
        path: ["money_year"],
        message: "money_year differs from the first_public_action year; add money_year_note explaining why",
      });
    }
    if (e.dates.conduct_start && e.dates.conduct_end && compareDates(e.dates.conduct_start, e.dates.conduct_end) > 0) {
      ctx.addIssue({ code: "custom", path: ["dates", "conduct_end"], message: "conduct_end is before conduct_start" });
    }
    const seen = new Set<string>();
    e.participants.forEach((p, i) => {
      if (seen.has(p.entity_id)) {
        ctx.addIssue({ code: "custom", path: ["participants", i, "entity_id"], message: `duplicate participant ${p.entity_id}` });
      }
      seen.add(p.entity_id);
      if (p.roles.includes("defendant") && p.status_history.length === 0) {
        ctx.addIssue({ code: "custom", path: ["participants", i, "status_history"], message: "a defendant must have at least one status entry" });
      }
      const lastByTrack = new Map<string, string>();
      let latest: string | null = null;
      p.status_history.forEach((s, j) => {
        const prev = lastByTrack.get(s.track);
        if (prev && compareDates(prev, s.date) > 0) {
          ctx.addIssue({ code: "custom", path: ["participants", i, "status_history", j, "date"], message: `status dates on the ${s.track} track must not go backwards` });
        }
        lastByTrack.set(s.track, s.date);
        if (!latest || compareDates(s.date, latest) > 0) latest = s.date;
      });
      if (latest && compareDates(p.status_verified, latest) < 0) {
        ctx.addIssue({ code: "custom", path: ["participants", i, "status_verified"], message: "status_verified must be on or after the latest status entry" });
      }
    });
  });
export type Event = z.infer<typeof Event>;
export type EventInput = z.input<typeof Event>;
