---
name: weekly-session
description: Run the owner's weekly review session for the corruption tracker - work through queue/candidates.yaml (docket updates, clemency, re-verification, possible new cases), draft and check changes in drafts/, show the owner review cards, promote only what the owner approves, and push a branch for a pull request. Use when the owner says "weekly session", "run the queue", or "/weekly-session".
---

# Weekly session

The owner is not a developer and has limited time. Explain each decision in one or two plain sentences,
group decisions so the owner answers once per batch, and never write a named individual into `data/`
without the owner's approval in this session. Read `CLAUDE.md`, then `docs/DRAFTING.md`, before step 1.

## 0. Start clean
1. `git checkout main && git pull --ff-only`. If the working tree is not clean, stop and tell the owner what is uncommitted.
2. Look for numbered duplicate files (`find data src scripts tests -name "* [0-9].*"`). The project lives in an
   iCloud-synced folder, which creates them on branch switches. Delete only untracked copies that are
   byte-identical to their original (`cmp`), and report what you removed.
3. `npm run validate` must pass. Create a branch `weekly-<YYYY-MM-DD>`.
4. `npm run queue:list` and show the owner the counts by kind.

## 1. Updates to published cases (`status_update`) - do these first, they are the legal priority
- **Docket entry:** read the entry text with the CourtListener API (see `docs/DRAFTING.md` Step 4b).
  If it changes a participant's status (plea, verdict, sentence, dismissal, acquittal, appeal, mistrial),
  draft the change: copy the event file from `data/events/` to `drafts/events/` ONLY if you will edit it,
  add a `court` source for the entry, add the status entry with a neutral note, update `status_verified`,
  and set `review.summary_stale: true` if the summary's attribution no longer fits. Procedural entries
  (scheduling, transcripts, motions) change nothing: `npm run queue:set -- <id> done "procedural"`.
- **Clemency name match:** confirm on the Pardon Attorney page that it is the same person (district,
  offense, sentence). Record it as `clemency` with that page as a source. If not the same person, reject it.
- Editing a published event: because `promote` only moves new files, apply approved changes to
  `data/events/<id>.yaml` directly after approval, then run `npm run validate`.

## 2. Re-verification (`verify_status`)
Check the docket for the named person. If nothing changed, update `status_verified` to today in the
event (after approval, as above) and mark the item done. If something changed, handle it as in step 1.

## 3. Possible new cases (`new_case`)
1. Read each flagged release. Reject quickly, with a short reason, anything outside SPEC.md §2: state or
   local officials with no federal official or federal prosecution, health care, pandemic relief, tax-only,
   benefits fraud with no official, or no official trigger. `npm run queue:set -- <ids> rejected "<reason>"`.
2. Present the remaining candidates to the owner as a short table (who, role, agency, what happened,
   release link) and ask which to draft. Mark the rest rejected or leave them open, as the owner says.
3. Draft each approved case following `docs/DRAFTING.md` in full, including the docket check.
   `npm run queue:set -- <id> drafted`.

## 4. Review
1. `npm run validate -- drafts data` until only `archive_url` lines remain, then
   `npm run rearchive -- drafts --skip-host www.courtlistener.com`.
2. `npm run review`. Give the owner `drafts/review/INDEX.md` and summarize every high-priority card in
   plain language: who is named, their status and why, money with basis, and any judgment call.
3. Wait for the owner's decisions. Apply requested edits and regenerate the cards.

## 5. Publish
1. `npm run promote -- --reviewer "<owner's reviewer name; Humanvue unless told otherwise>" <approved event ids>`.
2. `npm run check` must pass (validate, tests, build, download check).
3. Mark queue items done (`npm run queue:set -- <ids> done`). Commit `data/` and `queue/` together with a
   message listing each case added or changed. Push the branch and give the owner the pull request link:
   `https://github.com/Humanvue/Federal-fraud-and-public-corruption/pull/new/<branch>`.
4. Recap for the owner: what was added, what changed status, what was rejected and why, what is still
   open, and anything they must do (merge the pull request, save pages by hand, legal questions).

## Never
- Invent or infer facts, dates, dollar amounts, or dockets. If unconfirmed, leave it out and say so.
- State a person's status in a summary, or the penalties they face.
- Put drafts, names, or docket text in `queue/`.
- Complete CAPTCHAs or bot checks that need a person; stop and tell the owner instead.
