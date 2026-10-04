import { z } from "zod";
import { DateString } from "./common";

/**
 * The work queue (SPEC.md §7.1). It holds ONLY links to already-public pages, their public titles,
 * dates, and rule tags. Never drafts, summaries, or docket text.
 */
export const CandidateKind = z.enum([
  "new_case",       // a press release or clemency grant that may be a new case
  "status_update",  // new activity on a case already in data/ (docket entry, clemency)
  "verify_status",  // staleness rule: an unresolved person's status needs re-checking (SPEC §7.4)
]);
export type CandidateKind = z.infer<typeof CandidateKind>;

export const CandidateState = z.enum(["open", "drafted", "rejected", "done"]);
export type CandidateState = z.infer<typeof CandidateState>;

export const Candidate = z.strictObject({
  id: z.string().regex(/^q-[a-z0-9]{10}$/),
  kind: CandidateKind,
  source: z.enum(["doj", "courtlistener", "pardon_attorney", "staleness", "pin_report"]),
  url: z.url().nullable(),
  title: z.string().min(1),
  date: DateString.nullable(),
  feed: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  event_id: z.string().nullable().default(null),
  entity_id: z.string().nullable().default(null),
  first_seen: DateString,
  state: CandidateState.default("open"),
  note: z.string().nullable().default(null),
});
export type Candidate = z.infer<typeof Candidate>;

export const QueueFile = z.strictObject({
  candidates: z.array(Candidate).default([]),
});

/** Bookkeeping so each run only reports what is new. */
export const QueueState = z.strictObject({
  last_run: z.string().nullable().default(null),
  dockets: z.record(z.string(), z.strictObject({ last_entry: z.string().nullable(), checked: z.string() })).default({}),
  pardon_pages: z.record(z.string(), z.strictObject({ names_seen: z.array(z.string()), checked: z.string() })).default({}),
});
export type QueueStateT = z.infer<typeof QueueState>;
