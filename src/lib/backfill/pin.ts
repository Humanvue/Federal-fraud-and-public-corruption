/**
 * Parses the case captions in Part II of a Public Integrity Section Report to Congress
 * ("US v. Name, District"), with the section each falls under (federal branches, state and
 * local, election crimes). Works on PDF-extracted or OCR text.
 */
export interface PinCaption { caption: string; section: string }

const HEAD = /\n\s*(FEDERAL JUDICIAL BRANCH|FEDERAL LEGISLATIVE BRANCH|FEDERAL EXECUTIVE BRANCH|STATE AND LOCAL (?:CORRUPTION|GOVERNMENT)|(?:FEDERAL )?ELECTION CRIMES)\s*\n/g;

export function parsePartII(text: string): PinCaption[] {
  // Part II runs from its last heading occurrence (the first is the table of contents) to Part III.
  const p2 = [...text.matchAll(/\n\s*PART II\s*\n/g)].map((m) => m.index!);
  const start = p2.length ? p2[p2.length - 1] : 0;
  const end = [...text.matchAll(/\n\s*PART III\s*\n/g)].map((m) => m.index!).find((i) => i > start) ?? text.length;
  const body = text.slice(start, end);
  // A table of contents lists headings back to back; ignore any heading within 200 characters of another.
  const all = [...body.matchAll(HEAD)].map((m) => ({ name: m[1], at: m.index! }));
  const near = (i: number, j: number) => j >= 0 && j < all.length && Math.abs(all[j].at - all[i].at) <= 200;
  const heads = all.filter((_, i) => !near(i, i - 1) && !near(i, i + 1));
  const sectionAt = (i: number) => [...heads].reverse().find((h) => h.at <= i)?.name ?? "UNKNOWN";
  return [...body.matchAll(/\n\s*((?:US|U\.S\.|United States)\s+v\.\s+[^\n]{2,160})/g)].map((m) => ({
    caption: m[1].replace(/\s+/g, " ").replace(/\s*,\s*$/, "").trim(),
    section: sectionAt(m.index!),
  }));
}

export const isOutOfScopeSection = (section: string) => /STATE AND LOCAL|ELECTION/.test(section);

export function defendantOf(caption: string): string {
  return caption.replace(/^(US|U\.S\.|United States)\s+v\.\s+/, "").split(",")[0].replace(/\bet al\.?/i, "").trim();
}
