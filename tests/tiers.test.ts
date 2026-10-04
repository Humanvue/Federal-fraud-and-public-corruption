import { describe, expect, it } from "vitest";
import { tierCounts } from "../src/lib/tiers";
import { Candidate } from "../src/schemas/queue";
import { Tiers } from "../src/schemas/reference";
import fs from "node:fs";
import { parse } from "yaml";

const tier = { id: "hatch_act", name: "Hatch Act", definition: "d", enumerated_from: "e", enumerated_on: "2026-10-04" };
const c = (id: string, state: Candidate["state"], tags = ["tier:hatch_act"]) =>
  Candidate.parse({ id, kind: "new_case", source: "tier_list", url: "https://osc.gov/x", title: id, date: "2020", tags, first_seen: "2026-10-04", state });

describe("tier completeness", () => {
  it("counts items by state and is complete only when nothing is open or in progress", () => {
    const items = [c("q-aaaaaaaaaa", "done"), c("q-bbbbbbbbbb", "rejected"), c("q-cccccccccc", "open"), c("q-dddddddddd", "done", ["tier:congress"])];
    const [row] = tierCounts([tier], items);
    expect(row).toMatchObject({ total: 3, published: 1, excluded: 1, open: 1, inProgress: 0, complete: false });
    const [done] = tierCounts([tier], items.filter((i) => i.state !== "open"));
    expect(done.complete).toBe(true);
  });

  it("an empty tier is not complete", () => {
    expect(tierCounts([tier], [])[0].complete).toBe(false);
  });

  it("the tier definitions file is valid and holds no person ids", () => {
    const text = fs.readFileSync("data/reference/tiers.yaml", "utf8");
    expect(Tiers.safeParse(parse(text)).success).toBe(true);
    expect(text).not.toMatch(/per-[a-z]/);
  });
});
