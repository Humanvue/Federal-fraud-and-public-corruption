import { z } from "zod";
import { DateString, OrgId, SourceId } from "./common";

export const SourceType = z.enum(["government", "court", "news"]);
export type SourceType = z.infer<typeof SourceType>;

export const Author = z.strictObject({
  family: z.string().min(1),
  given: z.string().min(1),
});

export const Source = z
  .strictObject({
    id: SourceId,
    source_type: SourceType,
    publisher: z.string().min(1),
    publisher_org_id: OrgId.nullable().default(null),
    outlet_id: z.string().nullable().default(null),
    authors: z.array(Author).default([]),
    title: z.string().min(1),
    date_published: DateString,
    url: z.url(),
    archive_url: z.url().nullable().default(null),
    archive_status: z.enum(["ok", "failed", "blocked"]).default("ok"),
    text_file: z.string().nullable().default(null),
    accessed: DateString,
    report_number: z.string().nullable().default(null),
    link_status: z.enum(["ok", "broken", "redirected"]).default("ok"),
  })
  .superRefine((s, ctx) => {
    const official = s.source_type === "government" || s.source_type === "court";
    // The archive requirement is enforced by the validator (src/lib/validate.ts), not here, so a
    // source still waiting on the Wayback Machine loads and reports one clear problem instead of
    // making every record that cites it fail with "unknown source".
    if (official) {
      const expected = `sources/text/${s.id}.md`;
      if (s.text_file !== expected) {
        ctx.addIssue({ code: "custom", path: ["text_file"], message: `government and court sources must store full text at ${expected}` });
      }
    }
  });
export type Source = z.infer<typeof Source>;
