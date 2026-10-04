import { describe, expect, it } from "vitest";
import { coverageRows, officialsChargedByYear } from "../src/lib/coverage";
import { clone, loadFixture } from "./helpers";

describe("coverage", () => {
  it("counts federal officials by the year of their first criminal charge, once each", () => {
    const ds = clone(loadFixture());
    // The fixture's official was charged in 2019; a second charge entry must not double-count.
    ds.events[0].participants[0].status_history.push({ track: "criminal", status: "charged", date: "2020-01-01", source_ids: ["src-fixture-20190211-01"] });
    const by = officialsChargedByYear(ds);
    expect([...by.keys()]).toEqual([2019]);
    expect(by.get(2019)?.size).toBe(1);
  });

  it("ignores organizations and non-officials", () => {
    const ds = clone(loadFixture());
    ds.events[0].participants[0].actor_type = "private";
    expect(officialsChargedByYear(ds).size).toBe(0);
  });

  it("compares with national counts and leaves unreported years without a share", () => {
    const ds = clone(loadFixture());
    ds.pin = { description: "test", source_ids: ["src-fixture-20190211-01"], federal_officials: { "2019": { charged: 200, convicted: 150, awaiting_trial: 50 } } };
    const rows = coverageRows(ds, 2016);
    expect(rows).toEqual([{ year: 2019, ours: 1, national: 200, percent: 0.5 }]);
    ds.pin = null;
    expect(coverageRows(ds, 2016)[0]).toEqual({ year: 2019, ours: 1, national: null, percent: null });
  });
});
