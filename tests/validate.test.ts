import { describe, expect, it } from "vitest";
import { missingNumbers, validateDataset, validateDir } from "../src/lib/validate";
import { FIXTURE_DIR, clone, loadFixture } from "./helpers";

function messages(ds = loadFixture()): string[] {
  return validateDataset(ds, { dir: FIXTURE_DIR }).map((i) => i.message);
}

describe("validateDir", () => {
  it("passes on the valid fixture", () => {
    expect(validateDir(FIXTURE_DIR).issues).toEqual([]);
  });

  it("passes on the real data directory", () => {
    expect(validateDir("data").issues).toEqual([]);
  });
});

describe("cross-reference checks", () => {
  it("flags unknown ids everywhere they can appear", () => {
    const ds = clone(loadFixture());
    const e = ds.events[0];
    e.agencies.push("org-nope");
    e.contracts.push("con-nope");
    e.participants[0].entity_id = "per-nope";
    e.government_sources.push("src-nope-20200101-01");
    e.money.fines = { amount: 1, basis: "adjudicated", source_ids: ["src-nope-20200101-02"] };
    ds.corrections.push({ date: "2026-01-01", event_id: "evt-2020-nope", description: "x", source_ids: [], reported_via: null });
    const m = messages(ds);
    expect(m).toContainEqual(expect.stringContaining("unknown organization org-nope"));
    expect(m).toContainEqual(expect.stringContaining("unknown contract con-nope"));
    expect(m).toContainEqual(expect.stringContaining("unknown entity per-nope"));
    expect(m).toContainEqual(expect.stringContaining("unknown source src-nope-20200101-01"));
    expect(m).toContainEqual(expect.stringContaining("money.fines: unknown source"));
    expect(m).toContainEqual(expect.stringContaining("unknown event evt-2020-nope"));
  });

  it("rejects a news source listed as a government source", () => {
    const ds = clone(loadFixture());
    ds.sources[0].source_type = "news";
    expect(messages(ds)).toContainEqual(expect.stringContaining("is a news source"));
  });

  it("requires court_cases when a criminal track exists", () => {
    const ds = clone(loadFixture());
    ds.events[0].court_cases = [];
    expect(messages(ds)).toContainEqual(expect.stringContaining("court_cases is required"));
  });

  it("reports an unarchived government source once, without breaking records that cite it", () => {
    const ds = clone(loadFixture());
    ds.sources[0].archive_url = null;
    ds.sources[0].archive_status = "failed";
    const m = messages(ds);
    expect(m.filter((x) => x.includes("require a working archive"))).toHaveLength(1);
    expect(m).not.toContainEqual(expect.stringContaining("unknown source"));
  });

  it("reports a missing source text file", () => {
    const ds = clone(loadFixture());
    ds.sources[0].text_file = "sources/text/does-not-exist.md";
    expect(messages(ds)).toContainEqual(expect.stringContaining("text_file not found"));
  });
});

describe("editorial checks", () => {
  it("flags banned words in the title", () => {
    const ds = clone(loadFixture());
    ds.events[0].title = "Brazen contracting officer charged";
    expect(messages(ds)).toContainEqual(expect.stringContaining('banned word in title or summary: "brazen"'));
  });

  it("flags status statements in the summary", () => {
    const ds = clone(loadFixture());
    ds.events[0].summary += " The officer pleaded guilty in October 2019.";
    expect(messages(ds)).toContainEqual(expect.stringContaining('summary states a status ("pleaded guilty")'));
  });

  it("flags a number in the summary that no cited source contains", () => {
    const ds = clone(loadFixture());
    ds.events[0].summary += " Investigators reviewed 4,217 invoices.";
    expect(messages(ds)).toContainEqual(expect.stringContaining('number "4,217" in summary'));
  });
});

describe("missingNumbers", () => {
  it("matches scaled amounts in either form", () => {
    expect(missingNumbers("a loss of $3.1 million", ["loss of $3,100,000"])).toEqual([]);
    expect(missingNumbers("a loss of $3,100,000", ["loss of $3.1 million"])).toEqual(["$3,100,000"]);
    expect(missingNumbers("in 2016 and 2017", ["from 2016 through 2017"])).toEqual([]);
    expect(missingNumbers("12 counts", ["eleven counts"])).toEqual(["12"]);
  });
});

describe("court_cases rule and declinations", () => {
  it("does not require a court case when the only criminal entry is a declination", () => {
    const ds = clone(loadFixture());
    const e = ds.events[0];
    e.court_cases = [];
    e.participants = [
      { ...e.participants[0], status_history: [{ track: "criminal", status: "declined", date: "2021", source_ids: ["src-fixture-20190211-01"] }], status_verified: "2026-10-02" },
    ];
    expect(messages(ds)).not.toContainEqual(expect.stringContaining("court_cases is required"));
  });
});
