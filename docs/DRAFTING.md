# Drafting guide

How a case is drafted, from government pages to review cards. Used by the weekly session
(`.claude/skills/weekly-session/SKILL.md`) and by any agent drafting records. Tracked in git; `drafts/` is not.

You are drafting records for a fact-first public database. Read `SPEC.md` §3–§6 and `CLAUDE.md` first.
Work ONLY in `drafts/` (same layout as `data/`). Never edit `data/` directly: approved drafts reach it
through `npm run promote`. If several agents draft at once, never edit a file you did not create.

## Absolute rules
1. **Nothing is invented.** Every status entry, date, dollar figure, name, title, and docket must appear on a
   government or court page you fetched with `npm run source` (or a docket entry you recorded as a court source).
   If a fact is not on such a page, leave the field `null` or omit the entry and list it in your notes file.
2. **Steps known only from news are omitted.** Check the docket (Step 4b). If still unconfirmed, list the step in
   `drafts/notes/<topic>.md` as "needs docket check".
3. **Summaries never state status** and use no loaded adjectives. The validator enforces both. Status lives in
   `status_history`.
4. **Every number in a summary must appear in a cited government source text.** The validator checks this.
5. **Money fields are stated totals only.** Never put a single payment in a total field, never sum figures yourself, and never copy restitution into loss. No stated total means `null`.

## Step 1: sources (one YAML + one text file per government page)
```
npm run source -- --url <URL> --id src-<pub>-<yyyymmdd>-<nn> --publisher "<Publisher name>" --org <org-id>
```
- `<yyyymmdd>` is the page's publication date; `<nn>` is `01` unless that publisher published two pages that day.
- Check `ls data/sources drafts/sources` first; if the page was already fetched, reuse its id.
- Publisher slugs and names (use `--org` as shown):
  `usao-sdny` "U.S. Attorney's Office, Southern District of New York" org-usao-sdny (same pattern for every district: usao-edny, usao-sdca, usao-cdca, usao-sdtx, usao-wdtx, usao-mdfl, usao-sdfl, usao-dc, usao-edva, usao-sc, usao-ndil, usao-edla, usao-az, usao-ma, usao-md, usao-ndal, usao-hi, usao-ndny, usao-nj) ·
  `doj-opa` "U.S. Department of Justice, Office of Public Affairs" org-doj-opa ·
  `doj-oig` "U.S. Department of Justice, Office of the Inspector General" org-doj-oig ·
  `pardon-attorney` "Office of the Pardon Attorney" org-pardon-attorney ·
  `osc` "U.S. Office of Special Counsel" org-osc · `house-ethics` "House Committee on Ethics" org-house-ethics ·
  `senate-ethics` "Senate Select Committee on Ethics" org-senate-ethics ·
  `va-oig` org-va-oig · `doi-oig` org-interior-oig · `hhs-oig` org-hhs-oig · `treasury-oig` org-treasury-oig ·
  `dhs-hsi` org-hsi · `irs-ci` org-irs-ci · `govinfo` "U.S. Government Publishing Office (govinfo)" (court records; use `--type court` and the court's name as publisher, e.g. "U.S. District Court for the Southern District of California", org omitted) ·
  appellate opinions: `ca9`, `ca11`, `cadc` with publisher "U.S. Court of Appeals for the Ninth Circuit" etc., `--type court`.
- **PDFs:** the fetcher cannot read PDF text. Extract it first (`python3 -c "import pypdf,sys; r=pypdf.PdfReader(sys.argv[1]); print('\n'.join(p.extract_text() or '' for p in r.pages))" file.pdf > out.txt`), then run the fetcher with `--text out.txt --title "<title>" --date YYYY-MM-DD`.
- If the Wayback archive step fails, leave the file as written (`archive_status: failed`) and run
  `npm run rearchive -- drafts --skip-host www.courtlistener.com` at the end of the session; it waits out rate
  limits and falls back to the latest earlier snapshot. Never invent an archive URL.
- Clemency: the Pardon Attorney list pages are long; fetch once and cite the same source id for every person on it.

## Step 2: organizations
Existing ids: `ls data/organizations drafts/organizations`. Use them; do not create duplicates.
New companies or other bodies: `org-<short-name>` (e.g. `org-glenn-defense-marine-asia`, `org-quantadyn`). Check
`ls drafts/organizations` before creating. Fields: id, name, org_type (company | agency | nonprofit | court | other),
parent_org_id, uei (null unless on a government page), wikidata_qid (null).

## Step 3: people
`drafts/people/per-<given>-<family>.yaml`, lowercase ASCII, hyphens; drop middle names; on collision append `-2`.
```yaml
id: per-jane-doe
name: "Jane Doe"
aliases: []                      # other spellings used on government pages
wikidata_qid: null
positions:
  - { title: "U.S. Representative, NY-27", org_id: org-house, start: 2013, end: 2019-09-30, source_ids: [src-...] }
party_affiliation: { value: null, basis: null, source_ids: [] }   # fill ONLY if a government page you read states the party; else leave null and note it
```

## Step 4: the event
`drafts/events/evt-<YYYY>-<slug>.yaml` where YYYY = year of `dates.first_public_action` (the earliest PUBLIC official
action: an unsealing date, not a sealed filing date). Template:
```yaml
id: evt-2019-example-bribery
title: "Contracting officer sentenced in bribery scheme"   # role (not name) + conduct + verb matching the CURRENT status
categories: [bribery_kickbacks]                              # primary first; see SPEC §2
agencies: [org-...]                                          # agencies whose programs or personnel were involved
investigating_agencies: [org-...]                            # as named on the release ("investigated by")
prosecuting_office: org-usao-...                             # or org-doj-pin / org-doj-criminal-division; null for IG/OSC/Ethics-only
court_cases:                                                 # required when any criminal or civil entry exists
  - { court: "S.D.N.Y.", docket: null, courtlistener_id: null, source_ids: [src-...] }   # docket only if on a government page
jurisdiction_note: null
summary: >
  100-200 words from government sources only. Who (name and role), what, when, which agency, money.
  Attribution verbs: "According to the indictment", "The plea agreement states", "The court ordered",
  "OSC concluded", "The Inspector General found". No status statements, no adjectives.
dates:
  conduct_start: 2016-03          # YYYY, YYYY-MM or YYYY-MM-DD as precise as the source; null if unknown
  conduct_end: 2018-07-15
  first_public_action: 2019-02-11
money:                            # every entry: amount (integer dollars), basis, source_ids; loss also needs kind
  loss_to_government: null
  bribe_or_kickback: { amount: 250000, basis: admitted, source_ids: [src-...] }
  contract_value_involved: null
  settlement_amount: null
  restitution_ordered: { amount: 3100000, basis: adjudicated, source_ids: [src-...] }
  fines: null
  forfeiture: null
  whistleblower_share: null
participants:
  - entity_id: per-jane-doe
    actor_type: official          # official | contractor | private
    roles: [defendant, bribe_recipient]
    position: "Contracting Officer, GS-13"
    status_history:
      - { track: criminal, status: charged, date: 2019-02-11, source_ids: [src-...] }
      - { track: criminal, status: pleaded_guilty, date: 2019-10-04, source_ids: [src-...] }
      - { track: criminal, status: sentenced, date: 2020-09-30, source_ids: [src-...], note: "26 months; $200,000 fine" }
    administrative_actions: []    # resignation, removal_from_office, suspension, debarment, security_clearance_revoked
    clemency: []                  # { type: pardon | commutation, date, granted_by: "President Donald J. Trump", source_ids }
    status_verified: 2026-10-03
contracts: []
qui_tam: false
related_events: []
relationships: []
government_sources: [src-..., src-...]   # every source cited anywhere in this file
news_sources: []
tags: []                                  # e.g. [fat-leonard, hatch-act]
review: { reviewed_by: null, reviewed_at: null, ai_assisted: true, summary_stale: false }
last_updated: 2026-10-03
```
Dates: a status entry carries the date the court acted (the filing date of a complaint, indictment, or
information, even if sealed); `first_public_action` is the date the action became public (unsealing or
announcement). Note both when they differ ("filed under seal 2025-06-25; unsealed 2025-06-26").
Status mapping: indictment, information or complaint unsealed → `charged` · guilty plea → `pleaded_guilty` · jury or
bench verdict → `convicted` · sentence → `sentenced` · hung jury → `mistrial` · all counts dismissed → `dismissed`
· some counts dismissed → `partially_dismissed` (note which) · appellate reversal or vacatur → `overturned` ·
pretrial diversion or DPA → `deferred_prosecution` · DOJ declined after IG referral → `declined` (criminal track)
· IG, OSC, OGE or Ethics Committee finding → track `administrative`, `finding_issued` · body found no violation →
`no_violation_found` · pardon or commutation → `clemency` list, never a status · resignation or removal →
`administrative_actions`. Dates on one track must not go backwards; same-day entries are fine (put them in order).
Use `note` for specifics ("felony counts dismissed on government motion; misdemeanor plea under 18 U.S.C. § 1905").
Victim agencies may be participants with `roles: [victim_agency]`, `actor_type: official`, no status history.

## Step 4b: check the docket (required for every named participant)
Press releases stop before cases end. Search the docket with the CourtListener RECAP API
(no account; 5 requests per minute; wait 13 seconds between requests):
`https://www.courtlistener.com/api/rest/v4/search/?type=rd&q=<terms>&court=<id>&docket_number=<1:24-cr-00265>&order_by=entry_date_filed+desc`
(court ids: nysd, nyed, dcd, casd, cacd, txsd, flsd, flmd, vaed, ilnd, laed, ...; `filed_after` filters on the
CASE filing date, not the entry date). Record each docket entry you rely on as a `court` source in the format of
any existing `src-dcd-*` source: `url` is the CourtListener entry or docket page, `archive_status: blocked`
(CourtListener cannot be archived; SPEC §4.5), and the text file holds the entry text verbatim with a note
paragraph. Omit prison register numbers and home or prison addresses from stored text.

## Step 5: validate
`npm run validate -- drafts data` until the only problems left are `archive_url` lines (those clear with
`npm run rearchive`). Preview with `npm run preview:drafts`; generate review cards with `npm run review`.

## Step 6: notes
`drafts/notes/<topic>.md`: for each event, list omitted unconfirmed steps, null dockets, unknown party affiliation,
archive failures, and any judgment call you made. The owner reads this during review.

## Lessons from Phase 1 (do not repeat)
- A DOJ declination is a criminal-track `declined` entry and needs no court case.
- A pardon before trial is recorded as clemency; the status stays as it was (the docket usually shows a later dismissal).
- After a dismissal or acquittal, re-read the summary: no "is the defendant", no penalties faced.
- Never let a single payment, a computed sum, or restitution stand in for a total money field.
- A participant named only in a court opinion (an uncharged company) gets a role but no status.
