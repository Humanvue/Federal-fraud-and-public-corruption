import { describe, expect, it } from "vitest";
import { classifyTitle } from "../src/lib/queue/rules";
import { feedCandidates, parseRss } from "../src/lib/queue/doj";
import { candidateId, mergeCandidates } from "../src/lib/queue/merge";
import { courtIdFor, docketCandidates, newEntries, normalizeDocket, watchedDockets } from "../src/lib/queue/courtlistener";
import { nameAppears, pardonCandidates } from "../src/lib/queue/pardon";
import { stalenessCandidates } from "../src/lib/queue/staleness";
import { Candidate } from "../src/schemas/queue";
import { clone, loadFixture } from "./helpers";

const TODAY = "2026-10-04";

describe("title rules", () => {
  it.each([
    "Former Border Patrol Agent Sentenced for Accepting Bribes",
    "Retired Navy Admiral Sentenced to Six Years for Bribery Scheme",
    "Congressman Charged with Stealing FEMA Funds",
    "VA Procurement Supervisor Pleads Guilty to Taking Kickbacks",
    "Federal Correctional Officer Indicted for Receipt of a Bribe",
    "Former DEA Special Agent Convicted of Perjury and Obstruction",
  ])("flags %s", (t) => {
    expect(classifyTitle(t)).not.toBeNull();
  });

  it.each([
    "Three Men Charged With Trafficking Nearly 100 Firearms In New York City",
    "Social Adult Day Care Owner Pleads Guilty to $65M Medicaid Fraud",
    "Doctor Sentenced for Medicare Kickback Scheme",
    "Former County Sheriff Pleads Guilty to Accepting Bribes",
    "Man Sentenced for PPP Loan Fraud",
  ])("ignores %s", (t) => {
    expect(classifyTitle(t)).toBeNull();
  });

  it("keeps an out-of-scope topic when a federal official is involved, tagged as excluded", () => {
    const hit = classifyTitle("Federal Employee Charged in Medicare Bribery Scheme");
    expect(hit?.excluded).toContain("healthcare");
  });
});

const RSS = `<?xml version="1.0"?><rss><channel>
<item><title>Former Border Patrol Agent Sentenced for Accepting Bribes</title><link>https://www.justice.gov/usao-az/pr/a</link><pubDate>Fri, 02 Oct 2026 12:00:00 +0000</pubDate></item>
<item><title><![CDATA[Man Sentenced &amp; Fined for Firearms]]></title><link>https://www.justice.gov/usao-az/pr/b</link><pubDate>Thu, 01 Oct 2026 12:00:00 +0000</pubDate></item>
<item><title>Navy Officer Pleads Guilty to Bribery</title><link>https://www.justice.gov/usao-az/pr/known</link></item>
</channel></rss>`;

describe("press release feeds", () => {
  it("parses RSS items, decoding entities and CDATA", () => {
    const items = parseRss(RSS);
    expect(items).toHaveLength(3);
    expect(items[1].title).toBe("Man Sentenced & Fined for Firearms");
    expect(items[0].date).toBe("2026-10-02");
    expect(items[2].date).toBeNull();
  });

  it("keeps only flagged titles not already cited as a source, with valid candidates", () => {
    const c = feedCandidates(parseRss(RSS), "usao-az", new Set(["https://www.justice.gov/usao-az/pr/known"]), TODAY);
    expect(c.map((x) => x.url)).toEqual(["https://www.justice.gov/usao-az/pr/a"]);
    expect(Candidate.safeParse(c[0]).success).toBe(true);
    expect(c[0].tags).toContain("bribery");
  });
});

describe("merge", () => {
  const mk = (url: string, state: Candidate["state"] = "open"): Candidate =>
    Candidate.parse({ id: candidateId(url), kind: "new_case", source: "doj", url, title: url, date: "2026-10-01", first_seen: TODAY, state });

  it("never re-adds an id in any state, so rejected items stay rejected", () => {
    const existing = [mk("https://x/1", "rejected"), mk("https://x/2", "done")];
    const { merged, added } = mergeCandidates(existing, [mk("https://x/1"), mk("https://x/2"), mk("https://x/3")]);
    expect(added.map((a) => a.url)).toEqual(["https://x/3"]);
    expect(merged.find((m) => m.url === "https://x/1")?.state).toBe("rejected");
    expect(merged).toHaveLength(3);
  });

  it("ids are stable and well formed", () => {
    expect(candidateId("a")).toBe(candidateId("a"));
    expect(candidateId("a")).toMatch(/^q-[a-z0-9]{10}$/);
  });
});

describe("court dockets", () => {
  it("maps court labels and normalizes dockets", () => {
    expect(courtIdFor("D.D.C.")).toBe("dcd");
    expect(courtIdFor("S.D. Cal.")).toBe("casd");
    expect(courtIdFor("Narnia")).toBeNull();
    expect(normalizeDocket("1:24-cr-265")).toBe("1:24-cr-00265");
    expect(normalizeDocket("2:21-cr-00491-SB-1")).toBe("2:21-cr-00491");
    expect(normalizeDocket("25-4674")).toBe("25-4674");
    expect(normalizeDocket("23CR1291")).toBeNull();
  });

  it("watches dockets of cases still moving and skips settled ones", () => {
    const ds = clone(loadFixture());
    ds.events[0].court_cases[0].court = "D.D.C."; // the fixture's made-up court has no CourtListener id
    expect(watchedDockets(ds, TODAY)).toHaveLength(1); // the company is still only charged
    ds.events[0].participants[1].status_history.push({ track: "criminal", status: "dismissed", date: "2020-01-01", source_ids: ["src-fixture-20190211-01"] });
    ds.events[0].participants[0].status_history = ds.events[0].participants[0].status_history.slice(0, 3);
    expect(watchedDockets(ds, TODAY)).toHaveLength(0); // sentenced in 2020: past the 18-month appeal window
  });

  it("reports only entries newer than the last one seen", () => {
    const entries = [{ date: "2026-10-01", number: 9, url: "https://www.courtlistener.com/docket/1/9/" }, { date: "2026-09-01", number: 8, url: "https://www.courtlistener.com/docket/1/8/" }];
    expect(newEntries(entries, "2026-09-15").map((e) => e.number)).toEqual([9]);
    expect(newEntries(entries, null)).toEqual([]);
    const c = docketCandidates({ key: "dcd:1:24-cr-00265", court: "dcd", docket: "1:24-cr-00265", eventId: "evt-2024-x" }, newEntries(entries, "2026-09-15"), TODAY);
    expect(Candidate.safeParse(c[0]).success).toBe(true);
    expect(c[0].kind).toBe("status_update");
  });
});

describe("clemency lists", () => {
  it("matches first and last names in order, ignoring middle names and punctuation", () => {
    expect(nameAppears("George Santos", "George Anthony Devolder Santos Eastern New York")).toBe(true);
    expect(nameAppears("Henry Cuellar", "Enrique Roberto Cuellar")).toBe(false);
    expect(nameAppears("Duncan D. Hunter", "Duncan Hunter, Southern California")).toBe(true);
    expect(nameAppears("Smith", "John Smith")).toBe(false);
  });

  it("flags people without recorded clemency and skips those who have it", () => {
    const ds = clone(loadFixture());
    expect(pardonCandidates(ds, "https://p", "Pardon granted to Fixture Person of Fiction", TODAY)).toHaveLength(1);
    ds.events[0].participants[0].clemency = [{ type: "pardon", date: "2025-01-01", granted_by: "President", source_ids: ["src-fixture-20190211-01"] }];
    expect(pardonCandidates(ds, "https://p", "Pardon granted to Fixture Person of Fiction", TODAY)).toHaveLength(0);
  });
});

describe("staleness", () => {
  it("creates one verify task per stale unresolved person, re-armed by a new verification date", () => {
    const ds = clone(loadFixture());
    ds.events[0].participants[0].status_history = ds.events[0].participants[0].status_history.slice(0, 1);
    ds.events[0].participants[0].status_verified = "2025-06-01";
    const c = stalenessCandidates(ds, "2026-07-01");
    expect(c).toHaveLength(1);
    expect(c[0].kind).toBe("verify_status");
    ds.events[0].participants[0].status_verified = "2025-07-01";
    expect(stalenessCandidates(ds, "2026-07-01")[0].id).not.toBe(c[0].id);
  });
});
