import type { Dataset } from "../load";
import { stalenessTasks } from "../derive";
import { candidateId } from "./merge";
import type { Candidate } from "../../schemas/queue";

/** One verify_status candidate per unresolved named individual past the 12-month mark (SPEC §7.4). */
export function stalenessCandidates(ds: Dataset, today: string): Candidate[] {
  const out: Candidate[] = [];
  for (const e of ds.events) {
    for (const t of stalenessTasks(e, today)) {
      const p = e.participants.find((x) => x.entity_id === t.entity_id)!;
      const name = ds.people.find((x) => x.id === t.entity_id)?.name ?? t.entity_id;
      out.push({
        // One task per person per verification date, so a fresh verification re-arms the rule.
        id: candidateId(`verify#${e.id}#${t.entity_id}#${p.status_verified}`),
        kind: "verify_status",
        source: "staleness",
        url: null,
        title: `Re-verify status of ${name} (last verified ${p.status_verified}, ${t.months_since_verified} months ago)${t.action === "hide" ? "; now hidden from charts" : ""}`,
        date: today,
        feed: null,
        tags: [t.action],
        event_id: e.id,
        entity_id: t.entity_id,
        first_seen: today,
        state: "open",
        note: null,
      });
    }
  }
  return out;
}
