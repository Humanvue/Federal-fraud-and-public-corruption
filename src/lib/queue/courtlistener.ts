/**
 * Watches court dockets of cases that are still moving, via the CourtListener RECAP search API
 * (mirrors PACER docket text; no account needed, 5 requests per minute; a COURTLISTENER_TOKEN
 * environment variable raises the limit). Only the docket link, entry number and date go in the
 * queue; the weekly session reads the entry text.
 */
import type { Dataset } from "../load";
import { currentStatus, monthsBetween } from "../derive";
import { candidateId } from "./merge";
import type { Candidate, QueueStateT } from "../../schemas/queue";

/** Our court labels to CourtListener court ids. */
const COURTS: Record<string, string> = {
  "s.d.n.y.": "nysd", "e.d.n.y.": "nyed", "n.d.n.y.": "nynd", "w.d.n.y.": "nywd",
  "d.d.c.": "dcd", "s.d. cal.": "casd", "c.d. cal.": "cacd", "n.d. cal.": "cand", "e.d. cal.": "caed",
  "s.d. tex.": "txsd", "w.d. tex.": "txwd", "n.d. tex.": "txnd", "e.d. tex.": "txed",
  "s.d. fla.": "flsd", "m.d. fla.": "flmd", "n.d. fla.": "flnd",
  "e.d. va.": "vaed", "w.d. va.": "vawd", "d. md.": "mdd", "d. mass.": "mad", "d.n.j.": "njd", "d. haw.": "hid",
  "n.d. ill.": "ilnd", "e.d. la.": "laed", "m.d. la.": "lamd", "w.d. la.": "lawd", "d. ariz.": "azd", "d.s.c.": "scd", "d. s.c.": "scd",
  "n.d. ala.": "alnd", "d. neb.": "ned",
  "2d cir.": "ca2", "4th cir.": "ca4", "5th cir.": "ca5", "9th cir.": "ca9", "11th cir.": "ca11", "d.c. cir.": "cadc",
};

export function courtIdFor(court: string): string | null {
  return COURTS[court.trim().toLowerCase()] ?? null;
}

/**
 * Normalizes a district criminal docket to CourtListener's N:YY-cr-NNNNN form where possible
 * ("23CR1291" -> "3:23-cr-01291" needs the office number, which we cannot know, so such dockets
 * are searched by number only). Returns null when the value is not a recognizable docket.
 */
export function normalizeDocket(docket: string): string | null {
  const d = docket.trim();
  const full = /^(\d):(\d{2})-(cr|cv|mj)-(\d{1,5})/i.exec(d);
  if (full) return `${full[1]}:${full[2]}-${full[3].toLowerCase()}-${full[4].padStart(5, "0")}`;
  const appeal = /^\d{2}-\d{1,5}$/.exec(d);
  if (appeal) return d;
  return null;
}

/** Statuses after which a case can still change (pleas await sentence, appeals, open charges). */
const MOVING = new Set(["charged", "pleaded_guilty", "convicted", "mistrial", "partially_dismissed", "appeal_pending", "deferred_prosecution", "fugitive", "civil_complaint_filed"]);

export interface WatchedDocket { key: string; court: string; docket: string; eventId: string }

/** Dockets worth checking: any participant still moving, or sentenced within the last 18 months (appeals). */
export function watchedDockets(ds: Dataset, today: string): WatchedDocket[] {
  const out = new Map<string, WatchedDocket>();
  for (const e of ds.events) {
    const live = e.participants.some((p) => {
      const c = currentStatus(p);
      if (!c) return false;
      if (MOVING.has(c.status)) return true;
      return c.status === "sentenced" && monthsBetween(c.date, today) < 18;
    });
    if (!live) continue;
    for (const cc of e.court_cases) {
      const court = courtIdFor(cc.court);
      const docket = cc.docket ? normalizeDocket(cc.docket) : null;
      if (!court || !docket) continue;
      const key = `${court}:${docket}`;
      if (!out.has(key)) out.set(key, { key, court, docket, eventId: e.id });
    }
  }
  return [...out.values()];
}

export interface DocketEntry { date: string; number: number | null; url: string }

/** Picks entries newer than the last one seen. With no history, records the newest without flagging it. */
export function newEntries(entries: DocketEntry[], lastSeen: string | null): DocketEntry[] {
  if (!lastSeen) return [];
  return entries.filter((e) => e.date > lastSeen);
}

export function docketCandidates(w: WatchedDocket, fresh: DocketEntry[], today: string): Candidate[] {
  return fresh.map((en) => ({
    id: candidateId(`${w.key}#${en.number ?? ""}#${en.date}`),
    kind: "status_update" as const,
    source: "courtlistener" as const,
    url: en.url,
    title: `New docket entry${en.number ? ` #${en.number}` : ""} filed ${en.date} in ${w.court} ${w.docket}`,
    date: en.date,
    feed: null,
    tags: ["docket"],
    event_id: w.eventId,
    entity_id: null,
    first_seen: today,
    state: "open" as const,
    note: null,
  }));
}

export async function fetchDocketEntries(w: WatchedDocket): Promise<{ status: number; entries: DocketEntry[] }> {
  const headers: Record<string, string> = { "user-agent": "corruption-tracker/0.1 (GitHub Humanvue/Federal-fraud-and-public-corruption)" };
  if (process.env.COURTLISTENER_TOKEN) headers.authorization = `Token ${process.env.COURTLISTENER_TOKEN}`;
  const url = `https://www.courtlistener.com/api/rest/v4/search/?type=rd&q=*&court=${w.court}&docket_number=${encodeURIComponent(w.docket)}&order_by=entry_date_filed+desc`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, { headers });
    if (r.status === 429) {
      const wait = Number(r.headers.get("retry-after") ?? "60");
      await new Promise((res) => setTimeout(res, Math.min(wait, 300) * 1000));
      continue;
    }
    if (!r.ok) return { status: r.status, entries: [] };
    const j = (await r.json()) as { results?: { entry_date_filed?: string; document_number?: number | null; absolute_url?: string; docket_id?: number }[] };
    const entries = (j.results ?? [])
      .filter((x) => x.entry_date_filed)
      .map((x) => ({ date: x.entry_date_filed!, number: x.document_number ?? null, url: x.absolute_url ? `https://www.courtlistener.com${x.absolute_url}` : `https://www.courtlistener.com/docket/${x.docket_id}/` }));
    const unique = [...new Map(entries.map((e) => [`${e.date}#${e.number}`, e])).values()];
    return { status: r.status, entries: unique };
  }
  return { status: 429, entries: [] };
}
