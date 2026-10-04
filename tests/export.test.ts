import { describe, expect, it } from "vitest";
import { TABLES, datasetJson, toCSV, type TableName } from "../src/lib/export";
import { parseCSV } from "../src/lib/csv-parse";
import { Event } from "../src/schemas";
import { loadFixture } from "./helpers";

describe("toCSV", () => {
  it("quotes commas, quotes, and newlines, and neutralizes formula-like text", () => {
    const csv = toCSV({ columns: ["a", "b", "c", "d"], rows: [['x, "y"', "line1\nline2", "=SUM(A1)", -5]] });
    expect(csv).toBe('a,b,c,d\r\n"x, ""y""","line1\nline2",\'=SUM(A1),-5\r\n');
    expect(parseCSV(csv)).toEqual([["a", "b", "c", "d"], ['x, "y"', "line1\nline2", "'=SUM(A1)", "-5"]]);
  });
});

describe("tables", () => {
  const ds = loadFixture();
  it("every table has consistent row widths and round-trips through the parser", () => {
    for (const name of Object.keys(TABLES) as TableName[]) {
      const t = TABLES[name].build(ds);
      for (const r of t.rows) expect(r.length, name).toBe(t.columns.length);
      const parsed = parseCSV(toCSV(t));
      expect(parsed[0], name).toEqual(t.columns);
      expect(parsed.length - 1, name).toBe(t.rows.length);
    }
  });

  it("row counts match the data", () => {
    expect(TABLES["cases.csv"].build(ds).rows).toHaveLength(ds.events.length);
    expect(TABLES["participants.csv"].build(ds).rows).toHaveLength(ds.events.reduce((n, e) => n + e.participants.length, 0));
    expect(TABLES["sources.csv"].build(ds).rows).toHaveLength(ds.sources.length);
    expect(TABLES["status-history.csv"].build(ds).rows).toHaveLength(ds.events.reduce((n, e) => n + e.participants.reduce((m, p) => m + p.status_history.length, 0), 0));
  });

  it("keeps money basis next to every amount", () => {
    const t = TABLES["money.csv"].build(ds);
    const basis = t.columns.indexOf("basis");
    for (const r of t.rows) expect(["alleged", "admitted", "adjudicated", "estimated"]).toContain(r[basis]);
  });
});

describe("datasetJson", () => {
  it("publishes raw events that still pass the schema once the derived block is removed", () => {
    const doc = datasetJson(loadFixture(), "2026-10-03T00:00:00Z");
    for (const { derived, ...raw } of doc.events) {
      expect(derived.case_status).toBeTruthy();
      expect(Event.safeParse(JSON.parse(JSON.stringify(raw))).success).toBe(true);
    }
  });
});
