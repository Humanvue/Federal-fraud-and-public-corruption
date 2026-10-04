/**
 * Checks the Office of the Pardon Attorney clemency lists for people already in data/ who do not
 * yet have that clemency recorded, and for grants whose offense reads as public corruption.
 */
import type { Dataset } from "../load";
import { fetchPage } from "../archive";
import { candidateId } from "./merge";
import type { Candidate } from "../../schemas/queue";

export const PARDON_PAGES = [
  "https://www.justice.gov/pardon/clemency-grants-president-donald-j-trump-2025-present",
];

/** Lowercases and strips punctuation and middle initials so "George Anthony Devolder Santos" ~ "George Santos". */
export function nameTokens(name: string): string[] {
  return name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z\s-]/g, " ").split(/\s+/).filter((t) => t.length > 1 && !["jr", "sr", "ii", "iii"].includes(t));
}

/** True when the first and last tokens of `name` both appear, in order, in `text`. */
export function nameAppears(name: string, text: string): boolean {
  const toks = nameTokens(name);
  if (toks.length < 2) return false;
  const first = toks[0];
  const last = toks[toks.length - 1];
  const t = " " + nameTokens(text).join(" ") + " ";
  const i = t.indexOf(` ${first} `);
  return i >= 0 && t.indexOf(` ${last} `, i) > i;
}

export function pardonCandidates(ds: Dataset, pageUrl: string, pageText: string, today: string): Candidate[] {
  const out: Candidate[] = [];
  for (const e of ds.events) {
    for (const p of e.participants) {
      if (!p.entity_id.startsWith("per-") || p.clemency.length) continue;
      const person = ds.people.find((x) => x.id === p.entity_id);
      if (!person) continue;
      const names = [person.name, ...person.aliases];
      if (!names.some((n) => nameAppears(n, pageText))) continue;
      out.push({
        id: candidateId(`${pageUrl}#${p.entity_id}`),
        kind: "status_update",
        source: "pardon_attorney",
        url: pageUrl,
        title: `Clemency list names ${person.name}, who has no clemency recorded`,
        date: null,
        feed: null,
        tags: ["clemency", "name_match"],
        event_id: e.id,
        entity_id: p.entity_id,
        first_seen: today,
        state: "open",
        note: "Name match only: confirm it is the same person before recording anything.",
      });
    }
  }
  return out;
}

export async function fetchPardonPage(url: string): Promise<{ status: number; text: string }> {
  const r = await fetchPage(url);
  return { status: r.status, text: r.html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ") };
}
