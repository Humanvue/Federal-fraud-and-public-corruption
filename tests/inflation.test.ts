import { describe, expect, it } from "vitest";
import { adjustForInflation } from "../src/lib/inflation";
import { loadFixture } from "./helpers";

describe("adjustForInflation", () => {
  const cpi = loadFixture().cpi!;

  it("scales by the ratio of annual CPI-U values", () => {
    expect(adjustForInflation(100, 2016, cpi)).toBe(Math.round((100 * cpi.values["2025"]) / cpi.values["2016"]));
    expect(adjustForInflation(1_000_000, 2025, cpi)).toBe(1_000_000);
  });

  it("throws for a year with no CPI value", () => {
    expect(() => adjustForInflation(1, 1999, cpi)).toThrow(/no CPI-U value/);
  });
});
