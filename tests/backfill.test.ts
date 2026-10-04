import { describe, expect, it } from "vitest";
import { defendantOf, isOutOfScopeSection, parsePartII } from "../src/lib/backfill/pin";

const toc = "\nPART I\nPART II\nFEDERAL JUDICIAL BRANCH\nFEDERAL LEGISLATIVE BRANCH\nFEDERAL EXECUTIVE BRANCH\nSTATE AND LOCAL CORRUPTION\nFEDERAL ELECTION CRIMES\nPART III\n";
const filler = "x".repeat(300);
const body = `\nPART II\nintro ${filler}\nFEDERAL EXECUTIVE BRANCH\n${filler}\nUS v. Jane Roe, District of Columbia\nOn March 1 ... ${filler}\nSTATE AND LOCAL CORRUPTION\n${filler}\nUnited States v. Mayor Smith et al, District of Nowhere\n${filler}\nFEDERAL ELECTION CRIMES\n${filler}\nUS v. Donor, District of Columbia\n${filler}\nPART III\nUS v. Not Part Two\n`;

describe("Public Integrity Section report parsing", () => {
  it("assigns captions to body sections and ignores the table of contents and Part III", () => {
    const caps = parsePartII(toc + body);
    expect(caps).toEqual([
      { caption: "US v. Jane Roe, District of Columbia", section: "FEDERAL EXECUTIVE BRANCH" },
      { caption: "United States v. Mayor Smith et al, District of Nowhere", section: "STATE AND LOCAL CORRUPTION" },
      { caption: "US v. Donor, District of Columbia", section: "FEDERAL ELECTION CRIMES" },
    ]);
  });

  it("marks captions with no detectable section as UNKNOWN when body headings are missing (OCR)", () => {
    const ocr = toc + `\nPART II\n${filler}\nUnited States v. Tong, Northern District of California\n${filler}\nPART III\n`;
    expect(parsePartII(ocr)).toEqual([{ caption: "United States v. Tong, Northern District of California", section: "UNKNOWN" }]);
  });

  it("extracts defendants and flags out-of-scope sections", () => {
    expect(defendantOf("United States v. Chaka Fattah, et al., Eastern District of Pennsylvania")).toBe("Chaka Fattah");
    expect(defendantOf("US v. Edwards et al, District of Columbia")).toBe("Edwards");
    expect(isOutOfScopeSection("STATE AND LOCAL CORRUPTION")).toBe(true);
    expect(isOutOfScopeSection("FEDERAL EXECUTIVE BRANCH")).toBe(false);
  });
});
