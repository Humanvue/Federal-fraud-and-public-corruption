import { z } from "zod";
import { ContractId, DateString, OrgId, SourceIds } from "./common";

export function contractIdFor(awardId: string): string {
  return "con-" + awardId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const Contract = z
  .strictObject({
    id: ContractId,
    award_id: z.string().min(1),
    usaspending_url: z.url().nullable().default(null),
    awarding_agency_id: OrgId,
    recipient_org_id: OrgId,
    total_obligated: z.number().int().nonnegative().nullable().default(null),
    start_date: DateString.nullable().default(null),
    source_ids: SourceIds,
  })
  .refine((c) => c.id === contractIdFor(c.award_id), {
    path: ["id"],
    message: "contract id must be 'con-' plus the award id lowercased with non-alphanumerics replaced by '-'",
  });
export type Contract = z.infer<typeof Contract>;
