/** Wayback Machine archiving and bot-check-aware fetching shared by the source scripts. */
export const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 corruption-tracker/0.1";

/**
 * justice.gov (Akamai) answers the first request with a small interstitial that
 * sets cookies and meta-refreshes after 5 seconds to the same path plus a
 * `bm-verify` token. Following that refresh with the cookies yields the page.
 */
export async function fetchPage(target: string): Promise<{ status: number; html: string; finalUrl: string }> {
  const first = await fetch(target, { headers: { "user-agent": UA, accept: "text/html" }, redirect: "follow" });
  let html = await first.text();
  if (!/bm-verify/.test(html)) return { status: first.status, html, finalUrl: first.url };
  const refresh = /URL='([^']+)'/.exec(html)?.[1];
  if (!refresh) return { status: first.status, html, finalUrl: first.url };
  const cookies = (first.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const next = new URL(refresh, target).toString();
  await new Promise((r) => setTimeout(r, 5500));
  const second = await fetch(next, { headers: { "user-agent": UA, accept: "text/html", cookie: cookies }, redirect: "follow" });
  html = await second.text();
  return { status: second.status, html, finalUrl: second.url };
}

function decodeEntities(s: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", mdash: "—", ndash: "–", hellip: "…" };
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => named[n.toLowerCase()] ?? m);
}

/** Minimal HTML to text. Prefers <main> or <article>; drops nav, header, footer, scripts, styles. */
export function htmlToText(html: string): string {
  let h = html.replace(/<!--[\s\S]*?-->/g, "");
  for (const tag of ["script", "style", "noscript", "nav", "header", "footer", "aside", "form", "svg"]) {
    h = h.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, "gi"), " ");
  }
  const main = /<main\b[\s\S]*?<\/main>/i.exec(h)?.[0] ?? /<article\b[\s\S]*?<\/article>/i.exec(h)?.[0] ?? (/<body\b[\s\S]*?<\/body>/i.exec(h)?.[0] ?? h);
  let t = main
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|table|blockquote|section|ul|ol|dd|dt)>/gi, "\n")
    .replace(/<(h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ");
  t = decodeEntities(t)
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t;
}

export function findTitle(html: string): string {
  const og = /<meta\s+property="og:title"\s+content="([^"]*)"/i.exec(html)?.[1];
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  const t = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const raw = og ?? h1 ?? t ?? "";
  return decodeEntities(raw.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").replace(/\s*\|.*$/, "").trim();
}

export function findDate(html: string): string | null {
  const candidates = [
    /<meta\s+property="article:published_time"\s+content="([^"]+)"/i,
    /<meta\s+name="(?:date|dcterms\.date|citation_date|pubdate)"\s+content="([^"]+)"/i,
    /<time\b[^>]*datetime="([^"]+)"/i,
  ];
  for (const re of candidates) {
    const m = re.exec(html)?.[1];
    if (m) {
      const d = /^(\d{4}-\d{2}-\d{2})/.exec(m)?.[1];
      if (d) return d;
    }
  }
  const long = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/.exec(html);
  if (long) {
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${long[3]}-${String(months.indexOf(long[1]) + 1).padStart(2, "0")}-${long[2].padStart(2, "0")}`;
  }
  return null;
}

async function latestSnapshot(target: string, notBefore: number): Promise<string | null> {
  try {
    const avail = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(target)}&timestamp=${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`, { headers: { "user-agent": UA } });
    const j = (await avail.json()) as { archived_snapshots?: { closest?: { url?: string; timestamp?: string } } };
    const c = j.archived_snapshots?.closest;
    if (!c?.url || !c.timestamp) return null;
    const when = Date.parse(c.timestamp.replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, "$1-$2-$3T$4:$5:$6Z"));
    return when >= notBefore ? c.url.replace(/^http:/, "https:") : null;
  } catch {
    return null;
  }
}

/**
 * Archive on the Wayback Machine. Reuses a snapshot from the last 90 days;
 * otherwise asks Save Page Now, then confirms through the availability API,
 * because the save endpoint often answers without a usable location header
 * even when the snapshot was created.
 */
export async function archive(target: string): Promise<{ url: string | null; status: "ok" | "failed" }> {
  const recent = await latestSnapshot(target, Date.now() - 90 * 86400e3);
  if (recent) return { url: recent, status: "ok" };
  const started = Date.now() - 60e3;
  try {
    const res = await fetch(`https://web.archive.org/save/${target}`, { headers: { "user-agent": UA }, redirect: "follow" });
    const loc = res.headers.get("content-location") ?? res.headers.get("location");
    if (loc) return { url: loc.startsWith("http") ? loc : `https://web.archive.org${loc}`, status: "ok" };
    if (res.ok && /\/web\/\d{14}\//.test(res.url)) return { url: res.url, status: "ok" };
  } catch {
    /* confirmed below */
  }
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    const made = await latestSnapshot(target, started);
    if (made) return { url: made, status: "ok" };
  }
  return { url: null, status: "failed" };
}

