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

/**
 * Nationwide counts of federal officials prosecuted for public corruption by U.S. Attorneys' Offices,
 * from the Public Integrity Section's annual Report to Congress (Table II). Counts are defendants,
 * not cases, and use the Justice Department's own definition of public corruption. See SPEC.md §10.1.
 */
export const PinYear = z.strictObject({
  charged: z.number().int().nonnegative(),
  convicted: z.number().int().nonnegative(),
  awaiting_trial: z.number().int().nonnegative(),
});
export const PinStatistics = z.strictObject({
  description: z.string(),
  source_ids: z.array(z.string()).min(1),
  federal_officials: z.record(z.string().regex(/^\d{4}$/), PinYear),
});
export type PinStatistics = z.infer<typeof PinStatistics>;

/**
 * Completeness tiers (owner decision 2026-10-04, SPEC.md §11 Phase 4). Each tier's items live in the
 * queue tagged `tier:<id>`; a tier is complete when none of its items are open. This file holds only
 * definitions, never names.
 */
export const Tier = z.strictObject({
  id: z.string().regex(/^[a-z_]+$/),
  name: z.string().min(1),
  definition: z.string().min(1),
  enumerated_from: z.string().min(1),
  enumerated_on: z.string().nullable(),
});
export const Tiers = z.strictObject({ tiers: z.array(Tier).min(1) });
export type Tier = z.infer<typeof Tier>;
