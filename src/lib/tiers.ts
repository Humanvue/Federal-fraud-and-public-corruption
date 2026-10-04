/**
 * Completeness by tier (SPEC.md §11 Phase 4). Reads tier definitions from data/reference/tiers.yaml and
 * counts queue items tagged `tier:<id>` by state. Only counts are exposed: queue items that are still
 * open have not been reviewed, so their names never reach the site.
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { QueueFile, type Candidate } from "../schemas/queue";
import { Tiers, type Tier } from "../schemas/reference";

export interface TierRow { tier: Tier; total: number; published: number; excluded: number; inProgress: number; open: number; complete: boolean }

export function tierCounts(tiers: Tier[], candidates: Candidate[]): TierRow[] {
  return tiers.map((tier) => {
    const items = candidates.filter((c) => c.tags.includes(`tier:${tier.id}`));
    const count = (s: Candidate["state"]) => items.filter((c) => c.state === s).length;
    const open = count("open");
    const inProgress = count("drafted");
    return { tier, total: items.length, published: count("done"), excluded: count("rejected"), inProgress, open, complete: items.length > 0 && open === 0 && inProgress === 0 };
  });
}

export function loadTierRows(root = "."): TierRow[] {
  const tf = path.join(root, "data/reference/tiers.yaml");
  const qf = path.join(root, "queue/candidates.yaml");
  if (!fs.existsSync(tf) || !fs.existsSync(qf)) return [];
  const tiers = Tiers.parse(parse(fs.readFileSync(tf, "utf8"))).tiers;
  const queue = QueueFile.parse(parse(fs.readFileSync(qf, "utf8")) ?? {}).candidates;
  return tierCounts(tiers, queue);
}
