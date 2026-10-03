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
   Headline totals never include `alleged`.
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
| `npm run build` | Builds the static site into `dist/`. Set `DATA_DIR=drafts,data` to preview drafts, or `DATA_DIR=tests/fixtures/valid` to preview the fixture. |
| `npm run check` | validate + test + build, same as CI. |

## Layout
```
SPEC.md                 the spec (authoritative)
data/                   YAML database (real data only; see SPEC §4)
  events/ people/ organizations/ contracts/ sources/ sources/text/
  reference/cpi-u.yaml  corrections/corrections.yaml
queue/candidates.yaml   links only, written by the ingest Action (Phase 3)
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
src/pages/              Astro pages: cases, people, organizations, sources, about
src/components/         StatusBadge, SourceList, MoneyTable
scripts/                validate.ts, gen-json-schema.ts, add-source.ts
schemas/                GENERATED JSON Schema for editor validation; do not hand-edit
tests/                  Vitest; tests/fixtures/valid is a fictional dataset, never copy it into data/
.github/workflows/      CI: validate, test, typecheck, schema freshness, build
```

## Data conventions (SPEC §4.0)
- Event id year = year of `dates.first_public_action`.
- Dates may be `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`.
- Source ids: `src-<publisher>-<yyyymmdd>-<nn>`. Government and court sources need
  `archive_url` and full text at `data/sources/text/<id>.md` (public domain).
- Person ids: `per-<given>-<family>`; on collision append `-2`; never renumber.
- Contract ids: `con-` + award id lowercased, non-alphanumerics → `-`.

## Phase 1 review loop
1. Research candidates; the owner approves the list in chat.
2. For each approved case: `npm run source` for every government page, then write the event,
   people, and organization YAML into `drafts/` (same layout as `data/`).
3. `npm run validate -- drafts data` until clean; `DATA_DIR=drafts,data npm run dev` to preview.
4. Show the owner a review card per case. Only after approval, move the files into `data/`.
5. `npm run check`, commit, open the pull request.

## Phase status
- Phase 0 (foundation): complete.
- Phase 1: pages, citation generator, and add-source helper done; seed data in progress.
