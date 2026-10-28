# Design-system intake

Status of any theme's build lives in [`docs/BUILD-BACKLOG.json`](BUILD-BACKLOG.json) and the theme's
`docs/design-systems/<theme>/baseline.json` (the list of known gaps, which can only shrink). This file is the
procedure, not the record.

A Theme Kit arrives from Claude Design as a folder of hundreds of files (Nocturne: 348). The routine below makes
sure none is skipped, and that the code can be measured against every one of them, now and when the design
system is revised. Later themes (Designer, Temple, Wildheart and the rest) go through the same steps.

## The files

| Path | What it is |
|---|---|
| `docs/design-systems/<theme>/rules.json` | One rule per kind of file. First match wins. A rule says what the repo must hold for every file it claims. |
| `.../inventory.json` | Every design-system file with its size and sha256. The snapshot of "what the design says today". |
| `.../tokens.json` | Every custom property the design's token files declare, by selector. |
| `.../copy.json` | Every sentence a visitor can read in the prototypes, per source file. |
| `.../baseline.json` | Known gaps as `kind:key`, with the ledger row that closes them. It may only shrink. |
| `scripts/lib/design-system.mjs` | The pure functions: walk, rules, token and copy extraction, comparison. |
| `scripts/ds-intake.mjs` | The command: re-snapshot, diff against the last snapshot, run the repo side. |
| `scripts/design-system.test.ts` | The repo side as a test, so CI runs it with no copy of the design system. |

## Rule kinds

| Kind | The repo must hold |
|---|---|
| `skip` | Nothing. Needs a reason (working uploads, thumbnails). |
| `reference` | Nothing. Needs a reason (docs, prototype primitives, generated bundles). |
| `mirror` | The same path exists in the repo (the design system carries a copy of Frequency's own files; the repo is the authority). |
| `asset` | The target file exists with identical bytes (photos, screenshots). |
| `tokens` | Every `:root` custom property equals the repo's resolved value, after the rule's `tokenMap` renames. |
| `copy` | Every sentence of the source appears in the rule's targets (files or folders). |
| `built` | The named target exists (a theme file, a data file, a page). |

A file no rule claims fails the run. That is the whole point: nobody can miss a file by not looking.

## Steps for a new design system (or a new version of one)

1. Unzip into an **empty** folder outside the repo. Treat it as data; never run its scripts.
2. Copy `docs/design-systems/nocturne/rules.json` to `docs/design-systems/<theme>/`, change the theme ids, targets and the
   `tokenMap`, and add a rule for any file the old rules do not claim.
3. `node scripts/ds-intake.mjs --theme <theme> --ds <folder> --write` snapshots the folder. For a new version it first
   lists files **added**, **changed** and **removed** against the last snapshot: a changed file is a file to rebuild.
4. `DS_REPORT=1 pnpm vitest run scripts/design-system.test.ts` lists every gap with a reason. Read the list, group it
   into pull requests under the 40-file gate, one ledger row each.
5. Build. After each pull request, remove the ids that closed from `baseline.json`. A gap that closes and stays in the
   baseline fails as "healed"; a new gap fails as "fresh". Never re-freeze upward.
6. Compare rendered pages with the design's own, side by side at 1280 and 390 wide (`scripts/ds-pairs.mjs`), several
   passes: header and footer first, then each section, then forms, states and copy. A first pass that looks right has
   been wrong before (Alli Rae, 2026-10-27).
7. Clicks: every button, link and form on the new pages must work (the render tests and the pairs run both walk them).

## Fences that stay on

- **Theme fence** ([ADR-1906](DECISIONS.md)): a website theme never styles a member, Space console or admin area. The
  walking test `app/(main)/no-site-theme-in-member-area.test.ts` must stay green; render the console before and after.
- **No hand-rolled pages**: marketing pages compose kit components with tokens only (`pnpm check:marketing-kit`).
- **Site renders** are anonymous and cacheable; never the cookie Supabase client.
- **Copy** follows `docs/marketing/voice-and-language-guide.md`. Where the design's words and the voice guide disagree,
  the voice guide wins and the difference is written down in the row.
