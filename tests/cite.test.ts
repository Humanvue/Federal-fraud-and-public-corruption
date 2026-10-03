import { describe, expect, it } from "vitest";
import { apaCitation, apaDate } from "../src/lib/cite";
import { Source } from "../src/schemas";

function src(overrides: Record<string, unknown>) {
  return Source.parse({
    id: "src-doj-20190211-01",
    source_type: "government",
    publisher: "U.S. Department of Justice",
    title: "Contracting officer charged in bribery scheme",
    date_published: "2019-02-11",
    url: "https://www.justice.gov/usao/pr/example",
    archive_url: "https://web.archive.org/web/2019/https://www.justice.gov/usao/pr/example",
    text_file: "sources/text/src-doj-20190211-01.md",
    accessed: "2026-10-02",
    ...overrides,
  });
}

describe("apaDate", () => {
  it("respects precision", () => {
    expect(apaDate("2019-02-11")).toBe("2019, February 11");
    expect(apaDate("2019-02")).toBe("2019, February");
    expect(apaDate("2019")).toBe("2019");
  });
});

describe("apaCitation", () => {
  it("formats a government press release", () => {
    expect(apaCitation(src({}))).toBe(
      "U.S. Department of Justice. (2019, February 11). Contracting officer charged in bribery scheme [Press release]. https://www.justice.gov/usao/pr/example",
    );
  });

  it("formats a report with a report number", () => {
    expect(apaCitation(src({ report_number: "OIG-19-12", title: "Investigation of travel" }))).toBe(
      "U.S. Department of Justice. (2019, February 11). Investigation of travel (Report No. OIG-19-12). https://www.justice.gov/usao/pr/example",
    );
  });

  it("formats a court document", () => {
    expect(apaCitation(src({ source_type: "court", publisher: "U.S. District Court, E.D. Va.", title: "Plea agreement" }))).toBe(
      "U.S. District Court, E.D. Va. (2019, February 11). Plea agreement [Court document]. https://www.justice.gov/usao/pr/example",
    );
  });

  it("formats news with and without authors", () => {
    const news = { source_type: "news", publisher: "Associated Press", archive_url: null, text_file: null, title: "Officer charged?" };
    expect(apaCitation(src({ ...news, authors: [{ family: "Smith", given: "Jane Ann" }, { family: "Lee", given: "Bo" }] }))).toBe(
      "Smith, J. A., & Lee, B. (2019, February 11). Officer charged? Associated Press. https://www.justice.gov/usao/pr/example",
    );
    expect(apaCitation(src(news))).toBe("Officer charged? (2019, February 11). Associated Press. https://www.justice.gov/usao/pr/example");
  });
});
