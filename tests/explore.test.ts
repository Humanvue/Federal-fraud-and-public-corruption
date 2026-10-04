import { describe, expect, it } from "vitest";
import { DEFAULT_STATE, applyState, matches, moneyValue, parseQuery, sortRows, toQuery, escapeHtml, type ExploreRow, type FilterState } from "../src/lib/explore";
import { buildRows } from "../src/lib/rows";
import { rowHtml } from "../src/lib/explore-render";
import { clone, loadFixture } from "./helpers";

function row(over: Partial<ExploreRow> = {}): ExploreRow {
  return {
    id: "evt-2020-a", title: "A", href: "/cases/evt-2020-a/", categories: ["bribery_kickbacks"], categoryLabels: ["Bribery and kickbacks"],
    primaryCategory: "bribery_kickbacks", actorMix: "officials_only", eventStatus: "resolved",
    dates: { first_public_action: "2020-05-01", conduct_start: "2018", resolution: "2021-01-01" },
    agencies: [{ id: "org-navy", name: "U.S. Navy" }], participants: [], money: {}, moneyYear: 2020, text: "a navy",
    ...over,
  };
}
const S = (over: Partial<FilterState> = {}): FilterState => ({ ...DEFAULT_STATE, ...over });

describe("query string", () => {
  it("round-trips every non-default value and omits defaults", () => {
    const s = S({ q: "navy", basis: "conduct_start", from: 2016, to: 2020, actor: ["mixed"], cat: ["hatch_act", "bribery_kickbacks"], hatch: false, agency: "org-navy", status: "pending", pstatus: "charged", measure: "fines", min: 1000, max: 5000, alleged: true, sort: "money", dir: "asc" });
    expect(parseQuery(toQuery(s))).toEqual(s);
    expect(toQuery(DEFAULT_STATE)).toBe("");
  });

  it("ignores malformed values", () => {
    const s = parseQuery("?basis=nonsense&from=abc&measure=x&sort=y&dir=up&status=closed");
    expect(s).toEqual(DEFAULT_STATE);
  });
});

describe("filters", () => {
  it("matches keyword terms against the text index", () => {
    expect(matches(row(), S({ q: "NAVY" }))).toBe(true);
    expect(matches(row(), S({ q: "navy army" }))).toBe(false);
  });

  it("filters by year on the chosen date basis and excludes rows without that date", () => {
    expect(matches(row(), S({ from: 2020, to: 2020 }))).toBe(true);
    expect(matches(row(), S({ basis: "conduct_start", from: 2019 }))).toBe(false);
    expect(matches(row({ dates: { first_public_action: "2020", conduct_start: null, resolution: null } }), S({ basis: "resolution", from: 2000 }))).toBe(false);
  });

  it("hides off-by-default categories by primary category only", () => {
    const hatch = row({ primaryCategory: "hatch_act", categories: ["hatch_act"] });
    expect(matches(hatch, S())).toBe(true);
    expect(matches(hatch, S({ hatch: false }))).toBe(false);
    const health = row({ primaryCategory: "healthcare_fraud", categories: ["healthcare_fraud"] });
    expect(matches(health, S())).toBe(false);
    expect(matches(health, S({ healthcare: true }))).toBe(true);
  });

  it("excludes alleged money from money filters and sorting unless asked", () => {
    const r = row({ money: { loss_to_government: { nominal: 100, adjusted: 120, basis: "alleged" } } });
    expect(moneyValue(r, S())).toBeNull();
    expect(moneyValue(r, S({ alleged: true }))).toBe(120);
    expect(matches(r, S({ min: 50 }))).toBe(false);
    expect(matches(r, S({ min: 50, alleged: true }))).toBe(true);
  });

  it("uses nominal dollars when no inflation adjustment is available", () => {
    const r = row({ money: { fines: { nominal: 500, adjusted: null, basis: "adjudicated" } } });
    expect(moneyValue(r, S({ measure: "fines" }))).toBe(500);
  });
});

describe("sorting", () => {
  const a = row({ id: "evt-2019-a", title: "Beta", dates: { first_public_action: "2019", conduct_start: null, resolution: null }, money: { loss_to_government: { nominal: 10, adjusted: 10, basis: "adjudicated" } } });
  const b = row({ id: "evt-2021-b", title: "alpha", dates: { first_public_action: "2021-02", conduct_start: null, resolution: null } });
  it("sorts by date descending by default and by title ascending", () => {
    expect(sortRows([a, b], S()).map((r) => r.id)).toEqual(["evt-2021-b", "evt-2019-a"]);
    expect(sortRows([a, b], S({ sort: "title", dir: "asc" })).map((r) => r.title)).toEqual(["alpha", "Beta"]);
  });
  it("puts rows with no value last in both directions", () => {
    expect(sortRows([b, a], S({ sort: "money", dir: "asc" }))[1].id).toBe("evt-2021-b");
    expect(sortRows([b, a], S({ sort: "money", dir: "desc" }))[1].id).toBe("evt-2021-b");
  });
});

describe("rows from data", () => {
  it("builds one row per event with derived status and adjusted money", () => {
    const ds = loadFixture();
    const rows = buildRows(ds);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.eventStatus).toBe("partially_resolved");
    expect(r.money.restitution_ordered?.basis).toBe("adjudicated");
    expect(r.money.restitution_ordered?.adjusted).toBeGreaterThan(r.money.restitution_ordered!.nominal);
    expect(applyState(rows, DEFAULT_STATE)).toHaveLength(1);
  });

  it("escapes HTML in rendered rows", () => {
    const ds = clone(loadFixture());
    ds.events[0].title = `<img src=x onerror="alert(1)">`;
    const html = rowHtml(buildRows(ds)[0], DEFAULT_STATE);
    expect(html).not.toContain("<img");
    expect(escapeHtml(`"<&>'`)).toBe("&quot;&lt;&amp;&gt;&#39;");
  });
});
