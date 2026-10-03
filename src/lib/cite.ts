import type { Source } from "../schemas/source";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** APA-style date: "2019, February 11", "2019, February", or "2019". */
export function apaDate(d: string): string {
  const [y, m, day] = d.split("-");
  if (!m) return y;
  const month = MONTHS[Number(m) - 1];
  return day ? `${y}, ${month} ${Number(day)}` : `${y}, ${month}`;
}

function initials(given: string): string {
  return given
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + ".")
    .join(" ");
}

function authorList(s: Source): string {
  const names = s.authors.map((a) => `${a.family}, ${initials(a.given)}`);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length <= 20) return `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`;
  return `${names.slice(0, 19).join(", ")}, ... ${names[names.length - 1]}`;
}

function endWithPeriod(t: string): string {
  return /[.?!]$/.test(t) ? t : `${t}.`;
}

/**
 * APA 7 reference generated from source fields (SPEC.md §4.5).
 * - Government press release: Publisher. (Year, Month Day). Title [Press release]. URL
 * - Government report:        Publisher. (Year, Month Day). Title (Report No. X). URL
 * - Court document:           Publisher. (Year, Month Day). Title [Court document]. URL
 * - News with authors:        Family, G. (Year, Month Day). Title. Publisher. URL
 * - News without authors:     Title. (Year, Month Day). Publisher. URL
 */
export function apaCitation(s: Source): string {
  const date = `(${apaDate(s.date_published)}).`;
  const url = s.url;
  if (s.source_type === "news") {
    const authors = authorList(s);
    if (authors) return `${endWithPeriod(authors)} ${date} ${endWithPeriod(s.title)} ${endWithPeriod(s.publisher)} ${url}`;
    return `${endWithPeriod(s.title)} ${date} ${endWithPeriod(s.publisher)} ${url}`;
  }
  let title = s.title;
  if (s.report_number) title = `${title} (Report No. ${s.report_number})`;
  else if (s.source_type === "court") title = `${title} [Court document]`;
  else title = `${title} [Press release]`;
  return `${endWithPeriod(s.publisher)} ${date} ${endWithPeriod(title)} ${url}`;
}
