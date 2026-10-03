# Federal Fraud and Public Corruption Tracker — Project Spec

> **Status:** v0.2 draft · **Owner:** Big Poppa · **Working name:** `[Project Name]` (TBD)
>
> This file is the starting brief for Claude Code. Read it fully before writing code. When this spec and a later instruction conflict, ask the owner. A changelog from v0.1 is in §15.

---

## 1. Mission

Build a public, fact-first website that tracks **public corruption by federal officials** and, in a later layer, **fraud against the federal government by contractors**, from **2016 to the present**. The site tells the story through charts (incident counts and dollar amounts over time), lets readers drill from overview → case → people/companies → connections, and backs every fact with a source.

**v1 covers public corruption only.** An event enters v1 when at least one participant is a federal official, or the conduct is a bribe, kickback, or gratuity directed at a federal official. Contractor-only fraud (False Claims Act settlements, procurement fraud with no official involved) is the v2 layer; the schema supports it from day one so no migration is needed.

**Guiding principles**

1. **Official triggers only.** An event enters the database only when a government action exists (charge, finding, settlement). No rumors, no opinion pieces as the basis for inclusion.
2. **Status is always current and precise.** "Charged" never reads as "convicted." Acquittals, dismissals, reversals, and pardons are recorded as prominently as convictions. Status is tracked **per participant**, not per case.
3. **Every field has a source.** Readers can click from any number to where it came from.
4. **Alleged is not adjudicated.** Every dollar figure carries a basis (alleged, admitted, adjudicated, estimated). Headline totals use only admitted, adjudicated, and settled figures.
5. **Neutral language.** No adjectives that judge. Verbs match legal status.
6. **Open and correctable.** Public methodology, corrections log, downloadable data under an open license.
7. **Counts are counts of enforcement, not of corruption.** Every time chart says so, and recent years are marked incomplete.

---

## 2. Scope

### Actor types (`actor_type` on each participant, not on the event)
| Actor type | Examples |
|---|---|
| `official` | Federal employees, appointees, members of Congress, military personnel, contracting officers |
| `contractor` | Companies or individuals holding or seeking federal contracts or grants |
| `private` | Any other person or company (a briber who is not a contractor, a relative, a lobbyist, a PPP applicant) |

The event's actor mix is derived from its participants at build time (`officials_only`, `contractors_only`, `mixed`, `private_only`) and used for chart stacking.

### Categories (`categories` field: array; first entry is primary)
- `bribery_kickbacks`
- `conflict_of_interest_ethics`
- `embezzlement_theft`
- `false_statements_obstruction`
- `procurement_fraud`
- `grant_fraud`
- `hatch_act` — **in database, shown in its own tier, excluded from headline incident counts by default** (findings are numerous and mostly minor). Users can toggle it on.
- `healthcare_fraud` — v2 layer. **OFF by default in all charts and totals.**
- `pandemic_relief_fraud` — PPP, EIDL, and related programs. v2 layer. **OFF by default in all charts and totals.** Thousands of cases since 2020; it would dwarf every other category.
- `other`

### Explicitly out of scope (all versions unless revisited)
- Tax fraud and tax evasion
- Individual benefits fraud (Social Security, SNAP, unemployment insurance, veterans benefits) with no official involved
- Identity theft and stolen-identity refund fraud
- Immigration and visa fraud
- State and local officials, unless the case also involves a federal official or federal funds and is prosecuted federally (then set `jurisdiction_note`)
- Allegations with no official trigger
- Campaign-finance matters handled only by the FEC (revisit in v2)
- IG audit findings about improper payments, waste, or program management (not misconduct)

### Inclusion triggers (at least one required)
- Federal indictment, information, criminal complaint, plea, or conviction
- Inspector General **investigative** finding of misconduct or fraud (not audit findings of waste or improper payments)
- Office of Special Counsel or Office of Government Ethics finding
- House or Senate Ethics Committee finding (including a finding of no violation, recorded as such)
- Civil resolution (False Claims Act settlement or judgment) — v2 layer
- Court-martial result published by a military service, or a DoD IG / DCIS release, for military personnel
- Suspension or debarment (SAM.gov exclusion) tied to fraud or integrity issues — recorded as an administrative action, not a trigger on its own in v1

---

## 3. Status model

Status lives on each **participant** in an event. An event has several participants, each with their own `status_history` (array of dated entries) and derived `current_status`. The event itself gets a derived `event_status`.

### 3.1 Participant status values
Each entry has a `track`: `criminal`, `civil`, or `administrative`.

| Track | Status value | Meaning |
|---|---|---|
| criminal | `charged` | Indictment, information, or complaint filed |
| criminal | `pleaded_guilty` | Guilty plea entered |
| criminal | `convicted` | Found guilty at trial |
| criminal | `sentenced` | Sentence imposed |
| criminal | `acquitted` | Found not guilty on all counts |
| criminal | `dismissed` | All charges dismissed |
| criminal | `partially_dismissed` | Some charges dismissed; others remain |
| criminal | `mistrial` | Mistrial declared |
| criminal | `appeal_pending` | Conviction under appeal |
| criminal | `overturned` | Conviction reversed on appeal |
| criminal | `deferred_prosecution` | DPA / NPA entered |
| criminal | `declined` | Prosecution formally declined after public charge or referral |
| criminal | `deceased` | Defendant died before resolution |
| criminal | `fugitive` | Defendant at large |
| civil | `civil_complaint_filed` | Government civil complaint filed |
| civil | `settled_no_admission` | Civil settlement without admission of liability |
| civil | `settled_with_admission` | Settlement with admission of facts/liability |
| civil | `judgment_against` | Civil judgment for the government |
| civil | `civil_dismissed` | Civil complaint dismissed |
| administrative | `finding_issued` | IG / OSC / OGE / Ethics Committee finding of misconduct |
| administrative | `no_violation_found` | Body investigated and found no violation |

`under_investigation` is **removed** in v1. It is rarely officially confirmed and carries the highest legal risk.

### 3.2 Parallel facts that are not statuses
These are recorded on the participant as separate dated lists and never replace a status:
- `administrative_actions`: `suspension`, `debarment`, `removal_from_office`, `resignation`, `security_clearance_revoked` — each with `date` and `source_ids`
- `clemency`: `pardon` or `commutation` with `date`, `granted_by`, and `source_ids`

**Display rule:** a pardoned conviction reads "Convicted · later pardoned (DATE)," never "Pardoned" alone.

### 3.3 Derived values (computed at build, validated in CI)
- Participant `current_status` = latest entry on the participant's most advanced track (criminal outranks civil outranks administrative for display; all tracks are shown on the case page). A `declined` entry ranks below every other entry, because a declination means no criminal case exists.
- Participant `resolved` = true when current_status is any of: `sentenced`, `acquitted`, `dismissed`, `overturned`, `deferred_prosecution`, `declined`, `deceased`, `settled_*`, `judgment_against`, `civil_dismissed`, `finding_issued`, `no_violation_found`. (`pleaded_guilty` and `convicted` count as resolved for review purposes but not for the resolution date.)
- Event `event_status` = `pending` (no participant resolved), `partially_resolved`, or `resolved` (all participants resolved).
- Event `dates.resolution` = date of the last participant resolution, or null.

**Display rule:** every case page and card shows each named participant's status as a colored badge with "as of [date]," plus "Status last verified [date]" (see §7.4).

---

## 4. Data model

All data lives as **YAML files in the repo** under `/data`, validated against schemas on every commit. IDs are stable, lowercase slugs.

```
/data
  /events/        evt-YYYY-<slug>.yaml      # YYYY = year of first_public_action
  /people/        per-<slug>.yaml
  /organizations/ org-<slug>.yaml           # companies, agencies, nonprofits
  /contracts/     con-<award-id-lowercased>.yaml
  /sources/       src-<slug>.yaml
  /sources/text/  src-<slug>.md             # full text of government sources (public domain)
  /outlets/       outlets.yaml              # v2
  /reference/     cpi-u.yaml                # inflation index by year
  /corrections/   corrections.yaml
/queue
  candidates.yaml                           # URLs + rule tags only; never drafts (see §7)
```

### 4.0 Conventions
- **IDs:** `per-<given>-<family>`; on collision append `-2`, `-3`; never reuse or renumber. Contract IDs lowercase the award ID (`con-w912xx-17-c-0001`); the original case is kept in `award_id`. Source IDs are `src-<publisher-slug>-<yyyymmdd>-<nn>` (`src-doj-20190211-01`).
- **Dates:** ISO strings at year, month, or day precision (`2016`, `2016-03`, `2016-03-01`). The validator accepts all three; charts bucket by year.
- **Money:** nominal integer USD, null if unknown. Never summed across fields.
- **Computed fields are not stored.** `current_status`, `event_status`, `resolved`, `requires_human_review`, and edges are computed at build time. CI fails if a file contains them.

### 4.1 Event
```yaml
id: evt-2019-example-bribery
title: "Contracting officer charged in bribery scheme"      # neutral, status-accurate
categories: [bribery_kickbacks, procurement_fraud]         # first is primary
agencies: [org-dept-of-defense]                            # agencies whose programs or personnel were involved
investigating_agencies: [org-dcis, org-fbi]                # produces investigated_by edges
prosecuting_office: org-usao-edva                          # USAO district or Main Justice section
court_cases:                                               # REQUIRED when any criminal or civil track exists
  - { court: "E.D. Va.", docket: "1:19-cr-00045", courtlistener_id: null, source_ids: [src-doj-20190211-01] }
jurisdiction_note: null                                    # explain any state/local overlap
summary: >                                                 # site-written, from gov sources (§6); must NOT state status
  ...
dates:
  conduct_start: 2016-03                                   # precision as known
  conduct_end: 2018-07-15
  first_public_action: 2019-02-11                          # date of first charge/finding/settlement
money:
  loss_to_government:
    { amount: 3100000, basis: adjudicated, kind: actual, source_ids: [src-doj-20191004-01] }
  bribe_or_kickback:
    { amount: 250000, basis: admitted, source_ids: [src-doj-20191004-01] }
  contract_value_involved:
    { amount: 12000000, basis: alleged, source_ids: [src-doj-20190211-01] }
  settlement_amount: null
  restitution_ordered:
    { amount: 3100000, basis: adjudicated, source_ids: [src-doj-20200930-01] }
  fines: null
  forfeiture:
    { amount: 250000, basis: adjudicated, source_ids: [src-doj-20200930-01] }
  whistleblower_share: null
money_year: 2019                 # year used for inflation adjustment; defaults to first_public_action year
participants:
  - entity_id: per-jane-doe
    actor_type: official
    roles: [defendant, bribe_recipient]
    position: "Contracting Officer, GS-13"
    status_history:
      - { track: criminal, status: charged, date: 2019-02-11, source_ids: [src-doj-20190211-01] }
      - { track: criminal, status: pleaded_guilty, date: 2019-10-04, source_ids: [src-doj-20191004-01] }
      - { track: criminal, status: sentenced, date: 2020-09-30, source_ids: [src-doj-20200930-01] }
    administrative_actions:
      - { type: resignation, date: 2019-03-01, source_ids: [src-doj-20191004-01] }
    clemency: []
    status_verified: 2026-10-02                            # last date a human confirmed status (§7.4)
  - entity_id: org-acme-defense
    actor_type: contractor
    roles: [defendant, briber]
    status_history:
      - { track: criminal, status: charged, date: 2019-02-11, source_ids: [src-doj-20190211-01] }
    administrative_actions:
      - { type: debarment, date: 2019-06-01, source_ids: [src-sam-20190601-01] }
    status_verified: 2026-10-02
contracts: [con-w912xx-17-c-0001]
qui_tam: false
related_events: []                                         # spin-off or companion cases
relationships:                                             # explicit edges not derivable from fields
  - { from: per-jane-doe, to: per-john-roe, type: co_conspirator_with, source_ids: [src-doj-20190211-01] }
government_sources: [src-doj-20190211-01, src-doj-20191004-01]   # REQUIRED, min 1
news_sources: []                                           # v2
tags: []                                                   # e.g. fat-leonard, ppp
review:
  reviewed_by: null
  reviewed_at: null
  ai_assisted: true
  summary_stale: false                                     # set true automatically on any status change (§6.1)
last_updated: 2026-10-02
```

**Participant roles:** `defendant`, `briber`, `bribe_recipient`, `co_conspirator`, `relator` (qui tam whistleblower), `cooperating_witness`, `subject_of_finding`, `victim_agency`.

### 4.2 Person
```yaml
id: per-jane-doe
name: "Jane Doe"
aliases: ["Jane A. Doe"]
wikidata_qid: null               # optional, helps entity resolution
positions:
  - { title: "Contracting Officer", org_id: org-dept-of-defense, start: 2012, end: 2019, source_ids: [src-doj-20190211-01] }
party_affiliation:               # ONLY for elected officials and political appointees; null otherwise
  { value: null, basis: null, source_ids: [] }   # basis: elected | appointed
```

### 4.3 Organization
```yaml
id: org-acme-defense
name: "Acme Defense LLC"
org_type: company                # company | agency | nonprofit | court | other
parent_org_id: org-acme-holdings # for parent-company and sub-agency roll-up
uei: null                        # SAM.gov Unique Entity ID
wikidata_qid: null
```

### 4.4 Contract
```yaml
id: con-w912xx-17-c-0001
award_id: "W912XX-17-C-0001"
usaspending_url: "https://www.usaspending.gov/award/..."
awarding_agency_id: org-dept-of-defense
recipient_org_id: org-acme-defense
total_obligated: 12000000
start_date: 2017-01-15
```

### 4.5 Source
```yaml
id: src-doj-20190211-01
source_type: government          # government | court | news (news is v2)
publisher: "U.S. Department of Justice"
publisher_org_id: org-usao-edva  # optional link
outlet_id: null                  # v2
authors: []
title: "..."
date_published: 2019-02-11
url: "https://www.justice.gov/..."
archive_url: "https://web.archive.org/web/..."   # REQUIRED for government and court sources
archive_status: ok               # ok | failed | blocked; news sources may be 'failed' (v2)
text_file: sources/text/src-doj-20190211-01.md   # REQUIRED for government and court sources (public domain)
accessed: 2026-10-02
report_number: null              # for IG/GAO reports
link_status: ok                  # ok | broken | redirected; set by link checker
```
APA citations are **generated from these fields at build time**. Never store a hand-typed citation string. Government and court documents are public domain; their full text is stored in the repo so that automated checks and readers do not depend on the original URL surviving.

### 4.6 Outlet (v2)
Unchanged from v0.1; bias-rating source and license remain open questions. Not built in v1.

### 4.7 Relationships (link diagram)
Edges are **derived at build time** from participants' roles, positions, contracts, investigating agencies, and parent orgs:

| Edge | Derived from |
|---|---|
| `employed_by` / `official_of` | person.positions |
| `defendant_in` | participant with role `defendant` |
| `co_defendant_with` | two defendants in one event (capped: events with >8 defendants emit a hub edge to the event node instead) |
| `paid_bribe_to` / `received_bribe_from` | roles `briber` and `bribe_recipient` in the same event |
| `awarded_contract_to` | contract.awarding_agency_id → recipient_org_id |
| `subsidiary_of` | organization.parent_org_id |
| `investigated_by` | event.investigating_agencies |
| `whistleblower_in` | role `relator` |

Every edge traces back to at least one source ID (the field it was derived from must carry `source_ids`). Explicit edges not derivable from fields go in the event's `relationships:` list with `source_ids`.

### 4.8 Validation (runs in CI on every commit)
- Zod schema validation for every file; JSON Schema is generated from the Zod schemas so the owner's editor validates YAML while typing.
- Every event has ≥1 government source with `archive_url` and `text_file`.
- Every referenced ID exists; no stored computed fields.
- Every `status_history` entry has `source_ids`; statuses are valid for their track.
- Every `money.*` entry has `basis` and `source_ids`.
- Every event with a criminal or civil track has at least one `court_cases` entry.
- Every number in the summary appears in a cited source's `text_file`.
- Banned-words list (loaded adjectives) does not appear in titles or summaries.
- Summary contains no status verbs from the banned-status-phrases list ("was convicted," "pleaded guilty," "was acquitted"); status is displayed from data, not prose.
- Build fails on any violation.

---

## 5. Money and dates

- **Store nominal dollars** plus `money_year`. Display **inflation-adjusted constant dollars** (CPI-U, base = latest full year) by default, with a toggle for nominal.
- **Every figure has a basis:** `alleged` (charging document), `admitted` (plea or settlement with admission), `adjudicated` (verdict, sentencing, judgment), `estimated` (IG or GAO estimate). `loss_to_government` also carries `kind`: `actual` or `intended`.
- **Headline stats and chart totals use only `admitted`, `adjudicated`, and settlement figures.** Alleged figures appear on case pages labeled "alleged," and in charts only when the reader toggles "include alleged amounts."
- **Never add different money fields together.** Charts choose one measure at a time (default: `loss_to_government`; selectable: bribe amount, settlement, restitution, contract value).
- Dollar charts default to **median + total**, with a **log-scale toggle available only on unstacked views**; outliers listed separately ("Largest cases"). Each dollar chart states how many events have a non-null value for the chosen measure.
- Date toggle on every time chart: **conduct start / first public action (default) / resolution**.
- `money_year` defaults to the `first_public_action` year; an override must carry a note.

---

## 6. Writing rules

### 6.1 Event summary (one per event)
- Written **only from government and court sources** (public domain; quoting allowed).
- 100–200 words. Who, what, when, which agency, money. **Never the current status.** Status is rendered from data so the summary cannot go stale.
- Attribution verbs match the status at the time of writing: "prosecutors allege," "according to the plea agreement," "the IG found."
- **Any status change sets `review.summary_stale: true`** and re-queues the summary for the next weekly session, because "prosecutors allege" is wrong after a plea.
- No loaded adjectives ("brazen," "massive," "shocking").
- Party affiliation mentioned only if the person held an elected or politically appointed role, stated as a plain fact with a source.

### 6.2 News article abstracts
Moved to v2 in full. The v1 site links no news coverage.

### 6.3 Titles
Neutral and status-accurate: "Contracting officer charged in bribery scheme," not "Officer caught taking bribes." Titles are re-checked when status changes (a title that says "charged" after an acquittal is a correction).

---

## 7. Review and publishing workflow

The owner's time is limited and the owner is not a developer. **Every item in v1 is human-reviewed before it is committed**, and the review happens on the owner's machine in a weekly Claude Code session, so no unreviewed text about a named person is ever pushed anywhere.

### 7.1 Pipeline
1. **Queue (automated, GitHub Action, daily).** Fetches new items from the sources in §8, applies rules-based filters (justice.gov topic tags such as Public Corruption, keyword lists, source type), and commits **only URLs, titles, dates, and rule tags** to `/queue/candidates.yaml`. No drafts, no names beyond what is in the public headline. Also fetches: new CourtListener docket entries for open `court_cases`, new SAM.gov exclusions for known entities, and the Pardon Attorney clemency list, and writes them to the queue as `status_update` candidates.
2. **Weekly session (owner + Claude Code).** The owner runs one command. Claude Code works through the queue: fetches each source, archives it, saves full text, drafts the event YAML and summary into a **gitignored `drafts/` directory**, runs the checks, and presents each item to the owner with a one-screen review card (title, participants and statuses, money with basis, sources, check results). The owner approves, edits, or rejects each. Approved items move into `/data` and are committed with `reviewed_by` and `reviewed_at` set.
3. **Check.** Automated checks (§4.8) run locally before commit and again in CI.
4. **Pull request** per weekly batch, opened by the session. Everything in it is already reviewed; the PR is the audit trail.
5. **Publish.** Merging the PR deploys the site.

### 7.2 Review priority
Because all items are reviewed in v1, the computed `requires_human_review` flag from v0.1 becomes a **priority** that orders the review cards and is shown on the card:
- **High:** names an individual whose status is unresolved; changes a status to `acquitted`, `dismissed`, `overturned`, `mistrial`, or `no_violation_found`; adds `clemency`; is a correction; any check failed.
- **Normal:** everything else.

**Auto-merge is not enabled in v1.** Revisit after 100 reviewed items with a measured error rate.

### 7.3 Disclosure
Pages with AI-drafted text show: *"Summary drafted with AI assistance; reviewed by NAME on DATE."*

### 7.4 Staleness rule
- Every participant carries `status_verified`, the last date a human confirmed the status against a source.
- Any **unresolved named individual** whose `status_verified` is older than **12 months** (open question) is added to the weekly queue as a `verify_status` task.
- Case pages show "Status last verified [date]" for every participant. If verification is older than 18 months for an unresolved individual, the card shows a visible "status may be out of date" notice and the event is excluded from Story charts until verified.

### 7.5 Repository layout
One public repository. Drafts never enter Git; the queue contains only links to already-public government pages. This keeps the Git history as a public audit trail without publishing unreviewed text.

---

## 8. Data sources

**Verify every endpoint, rate limit, and terms of use before building a fetcher.** Prefer official APIs and feeds over HTML scraping.

| Source | Use | Notes |
|---|---|---|
| DOJ press releases (justice.gov, incl. U.S. Attorney offices) | Primary feed of charges, pleas, convictions | Filter by topic tag (verify "Public Corruption" tag exists in feed/API) before keyword rules |
| DOJ Public Integrity Section annual reports to Congress | **Primary backfill source**: lists public-corruption prosecutions with outcomes by year | PDFs; verify coverage 2016–present |
| DOJ Office of the Pardon Attorney clemency lists | Pardons and commutations (status updates) | Match by name + district + docket |
| CourtListener / RECAP | Dockets, case status updates | Free API token; key on docket from `court_cases` |
| Oversight.gov | Federal IG investigative reports | Filter to investigations, not audits |
| DoD IG / DCIS; service court-martial results pages (Army, Navy, Air Force, Marine Corps) | Military personnel cases | Verify each service's results page; only use published results |
| Office of Special Counsel / Office of Government Ethics | Hatch Act, ethics | OSC often withholds names; record org-level only when so |
| House & Senate Ethics Committees | Member findings | |
| USASpending.gov API | Contract details, award IDs | No key needed (verify) |
| SAM.gov Exclusions API | Suspensions/debarments, UEIs | Free API key |
| Wayback Machine "Save Page Now" | Archiving every government source URL | Free account for API; respect rate limits |
| BLS CPI-U | Inflation adjustment | Store annual values in `/data/reference` |
| U.S. Sentencing Commission datafiles | Denominator for the methodology page (how many federal bribery/fraud sentences per year exist vs. how many the site covers) | Context only, not events |

**Related projects to review (not to copy):** TRAC (Syracuse University), POGO, CREW, OpenSecrets, ProPublica.

---

## 9. Tech stack (free tier, low maintenance)

The owner is not a developer. Optimize for **simplicity, clear docs, and few moving parts.**

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (Node) everywhere | One language for site, scripts, validation |
| Site | **Astro** static site | Content-heavy, fast, simple |
| Data | YAML files in Git | Free, versioned; Git history = audit trail |
| Validation | Zod, with JSON Schema generated from it | One source of truth; editor validation for the owner |
| Charts | Apache ECharts | Rich interactivity, good for drill-down |
| Link diagram | Cytoscape.js, with an edge-list table alongside | Mature; the table is the accessible fallback |
| Search | Pagefind | Static search, no server |
| Hosting | GitHub Pages (preferred) or Cloudflare Pages | Free. Cloudflare Pages caps a deployment at 20,000 files; case + entity + source pages can exceed that |
| Automation | GitHub Actions | Daily queue fetch, link checks, CI |
| AI drafting | Claude Code run by the owner in the weekly session | No paid API in v1; revisit for backfill if the weekly session becomes a burden |
| Tests | Vitest | Standard for the stack |
| Licenses | CC BY 4.0 for data and text; MIT for code | Attribution-only serves reuse by journalists and researchers |

**Avoid:** servers, paid databases, user accounts, and anything that needs ongoing manual ops. Pin dependencies. If the data outgrows YAML (e.g., >20k events), revisit with SQLite built at deploy time.

---

## 10. Site features

### 10.1 Explore (drill-down table) — the v1 front door
- Filters: year range, date basis, actor mix, category, agency, status, money range and basis, Hatch Act on/off, healthcare and pandemic-relief on/off (v2 data).
- Sortable table; every chart element click applies a filter here.
- Shareable URLs (filters stored in the query string).
- Coverage statement at the top: "This database covers N of the M cases listed in DOJ Public Integrity Section reports for YEAR–YEAR."

### 10.2 Home / Story page — gated
Story charts render only once backfill coverage passes the threshold in §13 for every full year since 2016. Until then the home page shows headline counts, the coverage statement, and links to Explore.
- Headline stats: events tracked, participants by current status, total adjudicated + admitted + settled loss (inflation-adjusted).
- **Chart 1:** Incidents per year, stacked by actor mix.
- **Chart 2:** Dollar measure per year (median + total; log toggle on unstacked view only).
- **Chart 3:** Cases by primary category.
- **Chart 4:** Outcomes (participant status breakdown).
- Standing caveat under every time chart: *"Counts reflect official actions, not the total amount of corruption. Changes over time can reflect enforcement priorities, staffing, and policy, not only changes in misconduct. Recent years are incomplete: cases are often charged years after the conduct."* The two most recent years are visually marked as provisional.

### 10.3 Case page
- Title, per-participant status badges with "as of" and "last verified" dates, status timeline per participant, summary, money table (nominal + adjusted, with basis labels), participants, contracts, court cases, mini link diagram with edge-list table.
- **Sources section:** government and court sources with APA citation, original link, archived link, and stored text. News coverage section is v2.

### 10.4 Entity pages (person, organization, agency)
- Profile, related events, totals (with basis), network neighborhood plus edge-list table.
- Organization and agency pages roll up subsidiaries and sub-agencies.

### 10.5 Network explorer
- Full Cytoscape graph with filters (entity type, edge type, year, category); click a node to open its page.
- Default view limited (e.g., top N by connections) to stay readable. Edge-list table available for every view.

### 10.6 Trust pages
- **Methodology** (generated partly from this spec: scope, triggers, statuses, writing rules, the Sentencing Commission denominator).
- **Corrections log** (from `corrections.yaml` + Git history).
- **Submit a correction** (link to a GitHub issue template; no accounts, no third-party form service).
- **Download data** (CSV + JSON of all events, participants, entities, sources, edges; rebuilt each deploy; CC BY 4.0).
- **About / Disclaimer** (status definitions, "inclusion is not a finding of guilt," per-participant status explained).

### 10.7 Accessibility & mobile
- WCAG 2.1 AA, keyboard navigable, chart data and graph edges available as tables, works at phone width.

---

## 11. Build phases

| Phase | Deliverable | Done when |
|---|---|---|
| **0. Foundation** | Repo, Astro skeleton, Zod schemas + generated JSON Schema, validator, CI, `CLAUDE.md`, licenses | `npm run validate` passes on sample data; CI blocks bad data |
| **1. Seed + core pages** | ~25 hand-verified public-corruption events across categories; case pages, entity pages, APA generator, archive links, stored source text | Every seed event renders correctly; owner reviewed each |
| **2. Explore** | Explore table, filters, shareable URLs, Pagefind search, download files, coverage statement | Filter → case page works; downloads validate |
| **3. Queue + weekly session** | Daily queue Action; weekly session command with review cards; status-update candidates from CourtListener, SAM.gov, Pardon Attorney; staleness tasks | Two consecutive weekly sessions produce correct PRs with no manual fixes |
| **4. Backfill** | Public Integrity Section reports 2016–present worked through in weekly sessions; coverage statement live | Coverage threshold (§13) met for every full year |
| **5. Story charts** | Home charts, caveats, provisional-year marking | Click a bar → filtered table → case page |
| **6. Network** | Edge derivation, network explorer, mini graphs, edge-list tables | Graph renders; every edge links to a source |
| **7. Trust & launch** | Methodology, corrections, link checker Action, accessibility pass | Pre-launch checklist (§12) complete |

**MVP = Phases 0–3.** The site can launch publicly after Phase 7. Phases 4 and 5 may take many weekly sessions; the site is useful without them.

**v2 (not scheduled):** contractor fraud layer (FCA, procurement, healthcare, pandemic relief), news layer and outlet ratings, auto-merge for low-risk items, optional paid API for unattended drafting.

---

## 12. Pre-launch checklist
- [ ] Owner gets **legal review** of disclaimer, status language, per-participant status display, staleness rule, and the corrections policy (including requests to remove entries after acquittal or expungement).
- [ ] Every published event passes validation and has an archived government source with stored text.
- [ ] Every participant has `status_verified` within 12 months.
- [ ] Every event with a court case has a docket number.
- [ ] Methodology, corrections, and download pages live; licenses stated.
- [ ] Story charts either meet the coverage threshold or are hidden.
- [ ] Accessibility audit passed.

---

## 13. Open questions
1. Site name and domain. ("Federal Fraud and Public Corruption Tracker" is the working description.)
2. Exact start date: Jan 1, 2016 by first public action, or a rolling 10-year window?
3. Staleness thresholds: 12 months to re-verify, 18 months to hide from charts?
4. Story chart coverage threshold: 90% of Public Integrity Section–listed cases per full year?
5. Legal review: who, and when?
6. Should FEC-only campaign-finance cases be added in v2?
7. v2 bias-rating source and license (deferred with the news layer).

---

## 14. Instructions for Claude Code
- Create a `CLAUDE.md` in Phase 0 summarizing this spec's rules for future sessions.
- Work **one phase at a time**; summarize what changed and what the owner must do at the end of each phase.
- Explain any command the owner must run in plain language.
- **Never invent facts, cases, dollar amounts, or sources.** Seed data must come from real, cited, archived government sources; if unsure, leave the field null and flag it.
- **Never write a named individual into `/data` without the owner's approval in the session.** Drafts stay in `drafts/`.
- Keep dependencies minimal and well-known. Prefer boring, documented tools. Pin versions.
- Write tests for: schema validation, derived status and event_status, the review-priority rule, the staleness rule, APA citation formatting, inflation adjustment, edge derivation (including the co-defendant cap), and the "every number appears in a source" check.

---

## 15. Changelog from v0.1
- Scope narrowed to public corruption for v1; contractor fraud, healthcare, and pandemic relief become the v2 layer with the schema ready. Explicit exclusions listed (tax, benefits, identity theft, immigration, IG waste findings).
- Name and framing changed to "Federal Fraud and Public Corruption."
- Status moved from event to participant with tracks; `under_investigation` removed; mistrial, appeal, partial dismissal, declined, deceased, fugitive, and no-violation added; debarment and clemency made parallel facts, not statuses.
- Money fields carry basis (alleged / admitted / adjudicated / estimated) and actual-vs-intended; headline totals exclude alleged figures.
- Added `court_cases`, `investigating_agencies`, `prosecuting_office`, `related_events`, `tags`, `jurisdiction_note`, explicit `relationships`, expanded participant roles; actor type moved to participants; categories became an array; `private` actor type added.
- Government source full text stored in repo; `archive_url` required for government and court sources only.
- Summaries no longer state status; status changes mark summaries stale.
- Pipeline changed to queue-of-links plus weekly local session; drafts never enter Git; all items human-reviewed in v1; auto-merge deferred.
- Staleness rule and `status_verified` added; Pardon Attorney and court-martial sources added.
- Story charts gated on backfill coverage; right-censoring caveat; log scale limited to unstacked views; edge-list tables for accessibility.
- GitHub Pages preferred over Cloudflare Pages (20,000-file cap); JSON Schema generated from Zod; CC BY 4.0 data license, MIT code license.
- News layer, abstracts, outlet ratings, and coverage badge moved to v2.
- Phases reordered: Explore before Story; backfill is its own phase.
