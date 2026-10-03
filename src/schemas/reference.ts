import { z } from "zod";

/** Annual-average CPI-U (BLS series CUUR0000SA0). See SPEC.md §5. */
export const CpiU = z
  .strictObject({
    series_id: z.string().min(1),
    base_year: z.number().int(),
    source_url: z.url(),
    retrieved: z.string(),
    notes: z.array(z.string()).default([]),
    values: z.record(z.string().regex(/^\d{4}$/), z.number().positive()),
  })
  .refine((c) => String(c.base_year) in c.values, {
    path: ["base_year"],
    message: "base_year must have a value in values",
  });
export type CpiU = z.infer<typeof CpiU>;
