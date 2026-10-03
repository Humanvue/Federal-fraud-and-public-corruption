import { z } from "zod";
import { OrgId } from "./common";

export const Organization = z.strictObject({
  id: OrgId,
  name: z.string().min(1),
  org_type: z.enum(["company", "agency", "nonprofit", "court", "other"]),
  parent_org_id: OrgId.nullable().default(null),
  uei: z.string().regex(/^[A-Z0-9]{12}$/, "UEI is 12 alphanumeric characters").nullable().default(null),
  wikidata_qid: z.string().regex(/^Q\d+$/).nullable().default(null),
});
export type Organization = z.infer<typeof Organization>;
