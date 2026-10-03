import { z } from "zod";
import { DateString, OrgId, PersonId, SourceId, SourceIds } from "./common";

export const Position = z.strictObject({
  title: z.string().min(1),
  org_id: OrgId,
  start: DateString.nullable().default(null),
  end: DateString.nullable().default(null),
  source_ids: SourceIds,
});

export const PartyAffiliation = z
  .strictObject({
    value: z.string().nullable().default(null),
    basis: z.enum(["elected", "appointed"]).nullable().default(null),
    source_ids: z.array(SourceId).default([]),
  })
  .refine((p) => p.value === null || (p.basis !== null && p.source_ids.length > 0), {
    message: "party_affiliation needs a basis (elected or appointed) and at least one source when a value is set",
  });

export const Person = z.strictObject({
  id: PersonId,
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  wikidata_qid: z.string().regex(/^Q\d+$/).nullable().default(null),
  positions: z.array(Position).default([]),
  party_affiliation: PartyAffiliation.default({ value: null, basis: null, source_ids: [] }),
});
export type Person = z.infer<typeof Person>;
