# CLAUDE.md — working rules for this repository

Read `SPEC.md` before any non-trivial change. This file is the short version.

## What this is
A static website that tracks **public corruption by federal officials** (v1) from real,
cited, archived government sources. The owner is not a developer and has limited time.
Optimize for simplicity, plain-language explanations, and few moving parts.

## Hard rules
1. **Never invent facts, cases, people, dollar amounts, dates, dockets, or sources.**
   If a value is not in a cited government or court source, leave it `null` and flag it.
2. **Never write a named individual into `/data` without the owner's approval in the session.**
   Drafts go in `drafts/` (gitignored) until approved. The queue holds links only.
3. **Status is per participant and rendered from data.** Summaries never state status
   ("pleaded guilty", "was acquitted"). The validator enforces this.
4. **Every money figure has a `basis`** (alleged / admitted / adjudicated / estimated).
   Headline totals never include `alleged`. Each money field holds the total the source states for
   that measure. Never use one payment as the total, add payments up yourself, or copy one measure
   into another (restitution is not loss). If no source states the total, leave the field `null` and
   put the individual figures in the summary.
5. **Neutral language.** No loaded adjectives. Titles match legal status.
6. **Computed fields are never stored** (`current_status`, `event_status`, `resolved`,
   `requires_human_review`, edges). Schemas are strict and will reject them.
7. **Work one phase at a time** (SPEC.md §11). At the end of a phase, summarize what
   changed and what the owner must do, in plain language.
8. Keep dependencies minimal, pinned, and boring.

## Commands
| Command | What it does |
|---|---|
| `npm run validate` | Validates everything under `data/` (schemas, cross-references, editorial checks). Exit code 1 on any problem. |
| `npm run validate -- tests/fixtures/valid` | Same, against the test fixture. |
| `npm run validate -- drafts data` | Validates `drafts/` as an overlay on top of `data/` (drafts may reference existing records). |
| `npm run source -- --url <url> --id <src-id> --publisher "<name>"` | Fetches a government page, stores its text, archives it on the Wayback Machine, writes the source YAML into `drafts/`. |
| `npm test` | Unit tests (Vitest). |
| `npm run typecheck` | TypeScript check. |
| `npm run schema` | Regenerates `schemas/*.json` from the Zod schemas. Commit the result. |
| `npm run preview:drafts` | Local preview of drafts on top of data (missing archives tolerated, preview only). |
| `npm run rearchive -- drafts --pause 90` | Retries Wayback archives for sources whose archive failed. |
| `npm run review` | Writes one review card per draft event to `drafts/review/` plus `INDEX.md` (priority, validation, sources, notes). |
| `npm run promote -- --reviewer "Name" evt-...` | Moves an approved draft event and every new record it depends on from `drafts/` into `data/`, stamping the reviewer. `--all` promotes every clean draft. |
| `npm run queue` | Daily job: gathers candidates from DOJ feeds, dockets, clemency lists, and the staleness rule into `queue/`. `--only doj,courtlistener,pardon,staleness`, `--dry`. |
| `npm run queue:list` | Open queue items grouped by kind (`-- --all` for everything). |
| `npm run queue:set -- <ids> <open\|drafted\|rejected\|done> ["note"]` | Changes queue item state. |
| `npm run queue:discover` | Rebuilds `queue/feeds.yaml` (the 94 DOJ press release feeds); `-- usao-xx` for specific offices. |
| `npm run check:downloads` | After a build, verifies every file in `dist/downloads/` (schemas, columns, row counts, round trip). |
| `npm run build` | Builds the static site into `dist/` and the Pagefind search index into `dist/pagefind/`. Set `DATA_DIR=drafts,data` to preview drafts, or `DATA_DIR=tests/fixtures/valid` to preview the fixture. |
| `npm run check` | validate + test + build + download check, same as CI. |
| `npm run preview` | Serves the built site (search only works here, not in `npm run dev`). |

## Layout
```
SPEC.md                 the spec (authoritative)
data/                   YAML database (real data only; see SPEC §4)
  events/ people/ organizations/ contracts/ sources/ sources/text/
  reference/cpi-u.yaml  corrections/corrections.yaml
queue/candidates.yaml   links, public titles, dates, rule tags only; written daily by .github/workflows/queue.yml
queue/state.yaml        last docket entry seen per watched docket
queue/feeds.yaml        DOJ press release feeds (headquarters + every U.S. Attorney's office)
docs/DRAFTING.md        how to draft a case (sources, people, event, docket check, lessons)
.claude/skills/weekly-session/  the owner's weekly session (run /weekly-session)
drafts/                 gitignored; unreviewed drafts live here
src/schemas/            Zod schemas = single source of truth for the data model
src/lib/load.ts         reads YAML into typed collections
src/lib/derive.ts       currentStatus, eventStatus, reviewPriority, staleness
src/lib/validate.ts     cross-reference and editorial checks
src/lib/rules.ts        banned words and banned status phrases (owner-editable)
src/lib/inflation.ts    CPI-U adjustment
src/lib/cite.ts         APA citation generator
src/lib/format.ts       display labels for statuses, categories, money, dates
src/lib/data.ts         build-time data access for pages (fails the build on invalid data)
src/lib/rows.ts         build-time projection of events into Explore rows (derived status, adjusted money)
src/lib/explore.ts      PURE filter/sort/query-string logic shared by the browser and tests; no runtime imports
src/lib/explore-render.ts  table-row HTML used by both the server render and the browser
src/lib/export.ts       CSV tables and dataset.json for /downloads; csv-parse.ts verifies round trips
src/lib/archive.ts      Wayback archiving and justice.gov bot-check-aware fetching
src/lib/queue/          queue sources: doj.ts (RSS + title rules in rules.ts), courtlistener.ts, pardon.ts,
                        staleness.ts, merge.ts; src/schemas/queue.ts is the queue schema
src/pages/              Astro pages: explore, search, downloads (+ CSV/JSON endpoints), cases, people,
                        organizations, sources, about
src/components/         StatusBadge, SourceList, MoneyTable
scripts/                validate.ts, gen-json-schema.ts, add-source.ts, rearchive.ts, review-cards.ts,
                        promote.ts, check-downloads.ts
schemas/                GENERATED JSON Schema for editor validation; do not hand-edit
tests/                  Vitest; tests/fixtures/valid is a fictional dataset, never copy it into data/
.github/workflows/      CI: validate, test, typecheck, schema freshness, build
```

## Data conventions (SPEC §4.0)
- Event id year = year of `dates.first_public_action`.
- Dates may be `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`.
- Source ids: `src-<publisher>-<yyyymmdd>-<nn>`. Government and court sources need
  `archive_url` and full text at `data/sources/text/<id>.md` (public domain). Exception: court docket
  entries from CourtListener use `archive_status: blocked` with the docket text stored verbatim (SPEC §4.5).
- Person ids: `per-<given>-<family>`; on collision append `-2`; never renumber.
- Contract ids: `con-` + award id lowercased, non-alphanumerics → `-`.

## Phase 1 review loop
1. Research candidates; the owner approves the list in chat.
2. For each approved case: `npm run source` for every government page, then write the event,
   people, and organization YAML into `drafts/` (same layout as `data/`).
3. **Check the docket for every named participant** before review. Press releases stop before cases end;
   the CourtListener RECAP search API (no account; 5 requests/minute) mirrors PACER docket text and is
   how later pleas, dismissals, acquittals, and appeals are confirmed. Record each docket entry relied on
   as a `court` source (see an existing `src-dcd-*` source for the format).
4. `npm run validate -- drafts data` until clean; `npm run preview:drafts` to preview.
5. `npm run review`; the owner reads `drafts/review/INDEX.md` and each card and approves, edits, or rejects in chat.
6. Only after approval: `npm run promote -- --reviewer "<owner name>" <event ids>`, then `npm run check`, commit, open the pull request.
Drafting follows `docs/DRAFTING.md`; open items go in `drafts/notes/`. From Phase 3 on, this loop runs
as the weekly session: `.claude/skills/weekly-session/SKILL.md`.

## Phase status
- Phase 0 (foundation): complete.
- Phase 1 (seed data and core pages): complete 2026-10-03. All 29 owner-approved cases in `data/`,
  reviewed by Humanvue; statuses checked against court dockets.
- Phase 2 (Explore, search, downloads): built on branch `phase-2-explore`, 2026-10-03.
- Phase 3 (queue + weekly session): built on branch `phase-3-queue`. Done when two consecutive weekly
  sessions produce correct pull requests with no manual fixes. SAM.gov exclusions are not built yet: they
  need the owner's free SAM.gov API key (a repository secret).
- Note: the project folder is iCloud-synced; branch switches can leave "name 2.ext" duplicate files.
