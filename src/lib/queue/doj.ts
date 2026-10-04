import { fetchPage } from "../archive";
import { candidateId } from "./merge";
import { classifyTitle } from "./rules";
import type { Candidate } from "../../schemas/queue";

export interface FeedItem { title: string; url: string; date: string | null }

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parses an RSS 2.0 feed into items. pubDate becomes YYYY-MM-DD (UTC), or null if absent. */
export function parseRss(xml: string): FeedItem[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const it = m[1];
    const title = decode(/<title>([\s\S]*?)<\/title>/.exec(it)?.[1] ?? "");
    const url = decode(/<link>([\s\S]*?)<\/link>/.exec(it)?.[1] ?? "");
    const pub = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(it)?.[1];
    const t = pub ? Date.parse(pub) : NaN;
    return { title, url, date: Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null };
  }).filter((i) => i.title && i.url);
}

/** Turns feed items into new-case candidates, keeping only titles the rules flag. */
export function feedCandidates(items: FeedItem[], feedId: string, knownUrls: Set<string>, today: string): Candidate[] {
  const out: Candidate[] = [];
  for (const it of items) {
    if (knownUrls.has(it.url)) continue;
    const hit = classifyTitle(it.title);
    if (!hit) continue;
    out.push({
      id: candidateId(it.url),
      kind: "new_case",
      source: "doj",
      url: it.url,
      title: it.title,
      date: it.date,
      feed: feedId,
      tags: [...hit.tags, ...hit.excluded.map((x) => `excluded:${x}`)],
      event_id: null,
      entity_id: null,
      first_seen: today,
      state: "open",
      note: null,
    });
  }
  return out;
}

export async function fetchFeed(url: string): Promise<{ status: number; items: FeedItem[] }> {
  const r = await fetchPage(url);
  return { status: r.status, items: r.status === 200 ? parseRss(r.html) : [] };
}
