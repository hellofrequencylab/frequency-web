# Documentation Protocol: three homes

Every time we plan or ship something, documentation lands in the right home(s),
chosen by **audience**, with no duplication and no bloat. The core principle: we
**single-source the trigger and routing, not the prose**. One change updates each
surface in its own voice (a developer, an operator, and a member need different
words). This file is the canonical rule; it is pointed to from
[`AGENTS.md`](../AGENTS.md) (so every repo session follows it) and mirrored into the
Notion **AI Knowledge Base** (so Notion-started sessions follow it too).

## The three homes

| Home | Audience | Holds | Source of truth |
|---|---|---|---|
| **GitHub repo** (`docs/`, `DEVELOPMENT-MAP.md`, `ROADMAP.md`) | engineers, agents | schema, migrations, code, APIs, architecture decisions + rationale, env/config, the build plan | **the code** |
| **Public help center** (`content/help/`, served at `/help`) | members (end users) | how to **use** the live product, in member language | the relevant git doc |
| **Notion "Web Platform, Training & Strategy" database** | operators, hosts, non-engineers, training | how to **operate / moderate / understand** the product; worldview & strategy | the relevant git doc |

The Notion database lives under the **Web Community** page, data source
`collection://96c71490-1114-4c73-9547-88b5140126ed`. Help content lives in git and is
covered in detail by [HELP-CENTER.md](HELP-CENTER.md).

**Authority order never changes:** running code + `supabase/migrations/` > repo `docs/`
> public help + Notion. Both the help center and every Notion training page derive from,
and carry a pointer back to, the relevant git doc (its **"Source of truth"**).

## The router: apply to each thing planned or built

1. **Technical artifact?** (schema / migration / code / API / config) then update the
   relevant `docs/*.md`. If it is a **decision with rationale**, add an ADR to
   [`DECISIONS.md`](DECISIONS.md). If a build item moved, update
   [`DEVELOPMENT-MAP.md`](DEVELOPMENT-MAP.md).
2. **Does it change how a MEMBER uses the product?** then add/update the matching
   **help article** in `content/help/` (member voice), and add a human-facing line to
   [`CHANGELOG.md`](CHANGELOG.md) under `## [Unreleased]`. (Spec: HELP-CENTER.md.)
3. **Does it change how an OPERATOR / host / moderator operates or understands it?** then
   update the matching **Notion training page** (create a new page *only* for a genuinely
   new subject area).
4. **None of the above** (pure refactor, no user or operator impact) then **git only**
   (commit, + ADR if a decision was made). No help article, no Notion page.

Most features hit #1 every time, #2 when they are user-facing, and #3 sometimes.

## What goes where

| Change | git (technical) | help center (member) | Notion (operator) |
|---|---|---|---|
| New table / migration | `DATABASE.md` (+ ADR) | only if members do something new | only if operators do something new |
| New role / permission | `GLOSSARY.md` + `ARCHITECTURE.md` | only if it affects members | **Role & Permissions** page |
| New gamification mechanic | `GLOSSARY.md` + `DECISIONS.md` | the relevant **The game** article | **Crew Gamification** page |
| New user-facing feature flow | `ARCHITECTURE.md` / `DATABASE.md` (+ ADR) | the feature's how-to article (+ CHANGELOG) | the feature's operator page if any |
| Bug fix / refactor | commit (+ ADR if a decision) | only if behavior members see changed | only if operator behavior changed |
| Build status change | `DEVELOPMENT-MAP.md` | only if it ships a member feature | **MVP Build List** mirror page |

## Versioning

One spine (git), current-only by default.

- **`CHANGELOG.md`** ([Keep a Changelog](https://keepachangelog.com), written for humans)
  is the single source for the public [What's new](/help/changelog) page. Add entries
  under `## [Unreleased]` as you ship; on release, rename to `vX.Y.Z` + date.
- **Release tags** `vMAJOR.MINOR.PATCH` are the machine anchor.
- **Help articles** carry an `updated` date (freshness) and `featureKeys` (drift link).
- **Notion pages** carry **Source of truth** + a **Last synced** commit/date so drift is
  detectable.
- **Current-only**: a web app + auto-updating mobile means almost no user is on an old
  version, so we do not maintain versioned doc trees. Introduce them only if a breaking
  app-store version ever lingers (a later, local change).

## Anti-bloat rules (help + Notion)

- **One page per durable subject area**, never per PR or per session. Update in place.
- **No changelogs or build-logs in Notion.** That is what git history / PRs / CHANGELOG
  are for.
- **Right voice for the audience.** If a reader needs to read code to follow it, it
  belongs in git, not in help or Notion.
- **Link, don't duplicate.** Reference the git doc; never copy schema/code.
- **Prune.** If a help/Notion page becomes a stale duplicate, replace its body with a
  pointer or archive it.
- Always set **Type**, **Status**, and **Source of truth** on a Notion training-DB page.

## Per-feature checklist (run when shipping)

- [ ] git: relevant `docs/*.md` updated (`DATABASE` / `ARCHITECTURE` / `GLOSSARY`)
- [ ] git: ADR added to `DECISIONS.md` **if a decision was made**
- [ ] git: `DEVELOPMENT-MAP.md` build status updated if an item moved
- [ ] help: `content/help/` article added/updated **if member behavior changed**, and a
      human-facing line added to `CHANGELOG.md`
- [ ] Notion: training page updated **only if** operator-facing behavior changed
- [ ] help + Notion: each points back to the git doc as **Source of truth**, no duplicated code

## Automation in Claude Code

This protocol is wired into the repo so the multi-write is low-friction and hard to forget:

- **`AGENTS.md`** carries an inline summary of the router, injected into **every** Claude
  Code session in this repo.
- **`/sync-docs` skill** (`.claude/skills/sync-docs/`) runs the full multi-home write on
  demand: it inspects the diff, updates the right `docs/*.md` + ADR + DEVELOPMENT-MAP,
  adds/updates the `content/help/` article + CHANGELOG line, updates or creates the matching
  Notion training page in place, commits, and pushes. Run it after designing/shipping a
  change (or just say "sync the docs").
- **Docs-drift Stop hook** (`.claude/hooks/docs-drift-check.sh`) prints a one-line reminder
  when code changes without a matching docs change, and a second when a user-facing route
  changes without a `content/help` change. It never blocks.
- **CI drift check** (`.github/workflows/docs-drift.yml`) annotates a PR when user-facing
  routes change without help/docs updates, as a backstop to the local hook.

Together: you design and push; the hook and CI catch undocumented code; `/sync-docs` (or
any session following `AGENTS.md`) performs the git + help + Notion update. The help and
Notion legs only fire when the change is user- or operator-facing, keeping both lean.
