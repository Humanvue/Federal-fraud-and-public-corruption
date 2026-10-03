import type { CpiU } from "../schemas/reference";

/** Converts a nominal amount from `fromYear` dollars to `baseYear` dollars using annual CPI-U. */
export function adjustForInflation(amount: number, fromYear: number, cpi: CpiU, baseYear = cpi.base_year): number {
  const from = cpi.values[String(fromYear)];
  const base = cpi.values[String(baseYear)];
  if (from === undefined) throw new Error(`no CPI-U value for year ${fromYear}`);
  if (base === undefined) throw new Error(`no CPI-U value for base year ${baseYear}`);
  return Math.round((amount * base) / from);
}
