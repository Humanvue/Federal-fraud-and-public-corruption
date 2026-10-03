import { describe, expect, it } from "vitest";
import { Event, Source, type EventInput } from "../src/schemas";
import { loadFixture, clone } from "./helpers";

function rawEvent(): Record<string, unknown> {
  // Round-trip the parsed fixture back through the schema's input shape.
  return clone(loadFixture().events[0]) as unknown as Record<string, unknown>;
}

describe("Event schema", () => {
  it("accepts the fixture event", () => {
    expect(Event.safeParse(rawEvent()).success).toBe(true);
  });

  it("rejects stored computed fields", () => {
    for (const field of ["current_status", "event_status", "resolved", "requires_human_review", "actor_type"]) {
      const r = Event.safeParse({ ...rawEvent(), [field]: "x" });
      expect(r.success, field).toBe(false);
    }
  });

  it("rejects an id whose year does not match first_public_action", () => {
    const r = Event.safeParse({ ...rawEvent(), id: "evt-2020-fixture-bribery" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toMatch(/must match first_public_action year/);
  });

  it("rejects a status that belongs to another track", () => {
    const e = rawEvent() as EventInput;
    (e.participants[0].status_history![0] as { status: string }).status = "settled_no_admission";
    expect(Event.safeParse(e).success).toBe(false);
  });

  it("rejects money without a basis", () => {
    const e = rawEvent() as Record<string, any>;
    delete e.money.bribe_or_kickback.basis;
    expect(Event.safeParse(e).success).toBe(false);
  });

  it("requires a note when money_year is overridden", () => {
    expect(Event.safeParse({ ...rawEvent(), money_year: 2020 }).success).toBe(false);
    expect(Event.safeParse({ ...rawEvent(), money_year: 2020, money_year_note: "sentencing year" }).success).toBe(true);
  });

  it("accepts year-only and month-only dates, including bare YAML numbers", () => {
    const e = rawEvent() as Record<string, any>;
    e.dates.conduct_start = 2016;
    e.dates.conduct_end = "2018-07";
    expect(Event.safeParse(e).success).toBe(true);
    e.dates.conduct_end = "2018-13";
    expect(Event.safeParse(e).success).toBe(false);
  });

  it("rejects status_verified earlier than the latest status entry", () => {
    const e = rawEvent() as Record<string, any>;
    e.participants[0].status_verified = "2019-01-01";
    expect(Event.safeParse(e).success).toBe(false);
  });

  it("rejects a defendant with no status history", () => {
    const e = rawEvent() as Record<string, any>;
    e.participants[1].status_history = [];
    expect(Event.safeParse(e).success).toBe(false);
  });
});

describe("Source schema", () => {
  const base = {
    id: "src-doj-20190211-01",
    source_type: "government",
    publisher: "U.S. Department of Justice",
    title: "t",
    date_published: "2019-02-11",
    url: "https://www.justice.gov/x",
    archive_url: "https://web.archive.org/web/2019/https://www.justice.gov/x",
    text_file: "sources/text/src-doj-20190211-01.md",
    accessed: "2026-10-02",
  };

  it("accepts a government source with archive and text", () => {
    expect(Source.safeParse(base).success).toBe(true);
  });

  it("requires archive_url and text_file for government sources", () => {
    expect(Source.safeParse({ ...base, archive_url: null }).success).toBe(false);
    expect(Source.safeParse({ ...base, text_file: null }).success).toBe(false);
    expect(Source.safeParse({ ...base, text_file: "elsewhere.md" }).success).toBe(false);
  });

  it("allows a news source without an archive", () => {
    expect(Source.safeParse({ ...base, source_type: "news", archive_url: null, archive_status: "failed", text_file: null }).success).toBe(true);
  });
});
