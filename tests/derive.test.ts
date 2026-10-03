import { describe, expect, it } from "vitest";
import {
  actorMix,
  currentStatus,
  eventStatus,
  hiddenFromCharts,
  monthsBetween,
  resolutionDate,
  reviewPriority,
  stalenessTasks,
} from "../src/lib/derive";
import type { Event, Participant } from "../src/schemas";
import { clone, loadFixture } from "./helpers";

const SRC = ["src-fixture-20190211-01"];

function person(status_history: Participant["status_history"], extra: Partial<Participant> = {}): Participant {
  return {
    entity_id: "per-x",
    actor_type: "official",
    roles: ["defendant"],
    status_history,
    administrative_actions: [],
    clemency: [],
    status_verified: "2026-10-02",
    ...extra,
  };
}

function fixture(): Event {
  return clone(loadFixture().events[0]);
}

describe("currentStatus", () => {
  it("prefers the criminal track over administrative regardless of date", () => {
    const p = person([
      { track: "administrative", status: "finding_issued", date: "2021-05-01", source_ids: SRC },
      { track: "criminal", status: "charged", date: "2020-01-01", source_ids: SRC },
    ]);
    expect(currentStatus(p)?.status).toBe("charged");
  });

  it("takes the latest entry on the same track", () => {
    const p = person([
      { track: "criminal", status: "charged", date: "2020-01-01", source_ids: SRC },
      { track: "criminal", status: "acquitted", date: "2021", source_ids: SRC },
    ]);
    expect(currentStatus(p)?.status).toBe("acquitted");
  });

  it("is null with no history", () => {
    expect(currentStatus(person([]))).toBeNull();
  });
});

describe("eventStatus and resolutionDate", () => {
  it("fixture is partially resolved: one sentenced, one only charged", () => {
    const e = fixture();
    expect(eventStatus(e)).toBe("partially_resolved");
    expect(resolutionDate(e)).toBeNull();
  });

  it("becomes resolved when every tracked participant is resolved", () => {
    const e = fixture();
    e.participants[1].status_history.push({ track: "criminal", status: "deferred_prosecution", date: "2021-03-03", source_ids: SRC });
    expect(eventStatus(e)).toBe("resolved");
    expect(resolutionDate(e)).toBe("2021-03-03");
  });

  it("is pending when nobody is resolved, ignoring participants without history", () => {
    const e = fixture();
    e.participants[0].status_history = [{ track: "criminal", status: "charged", date: "2019-02-11", source_ids: SRC }];
    e.participants.push(person([], { entity_id: "org-fixture-agency", actor_type: "official", roles: ["victim_agency"] }));
    expect(eventStatus(e)).toBe("pending");
  });
});

describe("actorMix", () => {
  it("fixture is mixed", () => {
    expect(actorMix(fixture())).toBe("mixed");
  });
  it("ignores victim agencies", () => {
    const e = fixture();
    e.participants = [e.participants[0], person([], { entity_id: "org-fixture-agency", roles: ["victim_agency"], actor_type: "official" })];
    expect(actorMix(e)).toBe("officials_only");
  });
});

describe("reviewPriority (SPEC §7.2)", () => {
  it("is high for an unresolved named individual", () => {
    const e = fixture();
    e.participants[0].status_history = [{ track: "criminal", status: "charged", date: "2019-02-11", source_ids: SRC }];
    const r = reviewPriority(e);
    expect(r.priority).toBe("high");
    expect(r.reasons[0]).toMatch(/per-fixture-person/);
  });

  it("is normal when the only unresolved participant is an organization", () => {
    expect(reviewPriority(fixture()).priority).toBe("normal");
  });

  it("treats a guilty plea as resolved for review purposes", () => {
    const e = fixture();
    e.participants[0].status_history.pop(); // drop sentencing, leaving pleaded_guilty
    expect(reviewPriority(e).priority).toBe("normal");
  });

  it("is high for corrections, failed checks, clemency, and high-risk transitions", () => {
    const e = fixture();
    expect(reviewPriority(e, { isCorrection: true }).priority).toBe("high");
    expect(reviewPriority(e, { checksFailed: true }).priority).toBe("high");
    expect(reviewPriority(e, { clemencyAdded: true }).priority).toBe("high");
    expect(reviewPriority(e, { statusesChangedTo: ["acquitted"] }).priority).toBe("high");
    expect(reviewPriority(e, { statusesChangedTo: ["sentenced"] }).priority).toBe("normal");
  });
});

describe("staleness (SPEC §7.4)", () => {
  it("monthsBetween handles partial dates and day rollover", () => {
    expect(monthsBetween("2025-01-15", "2026-01-14")).toBe(11);
    expect(monthsBetween("2025-01-15", "2026-01-15")).toBe(12);
    expect(monthsBetween("2025", "2026-07")).toBe(18);
  });

  it("flags unresolved individuals at 12 months and hides at 18", () => {
    const e = fixture();
    e.participants[0].status_history = [{ track: "criminal", status: "charged", date: "2019-02-11", source_ids: SRC }];
    e.participants[0].status_verified = "2025-01-01";
    expect(stalenessTasks(e, "2025-12-01")).toEqual([]);
    expect(stalenessTasks(e, "2026-01-01")[0]?.action).toBe("verify");
    expect(stalenessTasks(e, "2026-07-01")[0]?.action).toBe("hide");
    expect(hiddenFromCharts(e, "2026-07-01")).toBe(true);
  });

  it("ignores resolved individuals and organizations", () => {
    const e = fixture();
    e.participants[0].status_verified = "2020-10-01"; // sentenced, so resolved
    e.participants[1].status_verified = "2019-06-01"; // organization, still only charged
    expect(stalenessTasks(e, "2026-10-02")).toEqual([]);
  });
});
