import { createHash } from "node:crypto";
import type { Candidate } from "../../schemas/queue";

/** Stable id from a candidate's identity (usually its URL), so reruns never duplicate items. */
export function candidateId(key: string): string {
  return "q-" + createHash("sha1").update(key).digest("hex").slice(0, 10);
}

/**
 * Adds fresh candidates to the queue. An id already present in ANY state is never re-added, so a
 * rejected item stays rejected and a done item does not come back. Returns the merged list and
 * the items that were new.
 */
export function mergeCandidates(existing: Candidate[], fresh: Candidate[]): { merged: Candidate[]; added: Candidate[] } {
  const seen = new Set(existing.map((c) => c.id));
  const added: Candidate[] = [];
  for (const c of fresh) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    added.push(c);
  }
  const order: Record<Candidate["kind"], number> = { status_update: 0, verify_status: 1, new_case: 2 };
  const merged = [...existing, ...added].sort(
    (a, b) => (a.state === "open" ? 0 : 1) - (b.state === "open" ? 0 : 1) || order[a.kind] - order[b.kind] || (b.date ?? "").localeCompare(a.date ?? "") || a.id.localeCompare(b.id),
  );
  return { merged, added };
}
