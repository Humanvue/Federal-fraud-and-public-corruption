import { z } from "zod";

// ---- ID conventions (SPEC.md §4.0) ---------------------------------------
const slug = "[a-z0-9]+(?:-[a-z0-9]+)*";
export const ID_PATTERNS = {
  event: new RegExp(`^evt-\\d{4}-${slug}$`),
  person: new RegExp(`^per-${slug}$`),
  organization: new RegExp(`^org-${slug}$`),
  contract: new RegExp(`^con-${slug}$`),
  source: new RegExp(`^src-${slug}-\\d{8}-\\d{2}$`),
} as const;

export const EventId = z.string().regex(ID_PATTERNS.event, "event id must look like evt-YYYY-slug");
export const PersonId = z.string().regex(ID_PATTERNS.person, "person id must look like per-slug");
export const OrgId = z.string().regex(ID_PATTERNS.organization, "organization id must look like org-slug");
export const ContractId = z.string().regex(ID_PATTERNS.contract, "contract id must look like con-slug");
export const SourceId = z.string().regex(ID_PATTERNS.source, "source id must look like src-publisher-YYYYMMDD-NN");
export const EntityId = z.union([PersonId, OrgId]);

export function isPersonId(id: string): boolean {
  return id.startsWith("per-");
}

// ---- Dates: YYYY, YYYY-MM, or YYYY-MM-DD (SPEC.md §4.0) ------------------
const DATE_RE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

export function isValidDateString(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = m[2] ? Number(m[2]) : 1;
  const d = m[3] ? Number(m[3]) : 1;
  if (y < 1900 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Pads a partial date to YYYY-MM-DD (first day of the period) for ordering. */
export function normalizeDate(s: string): string {
  const m = DATE_RE.exec(s);
  if (!m) throw new Error(`invalid date string: ${s}`);
  return `${m[1]}-${m[2] ?? "01"}-${m[3] ?? "01"}`;
}

export function yearOf(s: string): number {
  return Number(s.slice(0, 4));
}

export function compareDates(a: string, b: string): number {
  return normalizeDate(a).localeCompare(normalizeDate(b));
}

// YAML parses a bare `2016` as a number, so accept numbers and coerce.
export const DateString = z
  .union([z.string(), z.number().int()])
  .transform((v) => String(v))
  .refine(isValidDateString, "date must be YYYY, YYYY-MM, or YYYY-MM-DD and must be a real date");

// ---- Sources and money -----------------------------------------------------
export const SourceIds = z.array(SourceId).min(1, "at least one source id is required");

export const MoneyBasis = z.enum(["alleged", "admitted", "adjudicated", "estimated"]);
export type MoneyBasis = z.infer<typeof MoneyBasis>;

export const MoneyEntry = z.strictObject({
  amount: z.number().int().nonnegative(),
  basis: MoneyBasis,
  source_ids: SourceIds,
  note: z.string().optional(),
});
export type MoneyEntry = z.infer<typeof MoneyEntry>;

export const LossEntry = z.strictObject({
  ...MoneyEntry.shape,
  kind: z.enum(["actual", "intended"]),
});
export type LossEntry = z.infer<typeof LossEntry>;
