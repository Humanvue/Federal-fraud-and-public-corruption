import { z } from "zod";
import { DateString, EventId, SourceId } from "./common";

export const Correction = z.strictObject({
  date: DateString,
  event_id: EventId,
  description: z.string().min(1),
  source_ids: z.array(SourceId).default([]),
  reported_via: z.string().nullable().default(null),
});
export type Correction = z.infer<typeof Correction>;

export const Corrections = z.array(Correction);
