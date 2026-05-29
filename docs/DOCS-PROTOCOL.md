# Documentation Protocol — git ⇄ Notion

Every time we plan or ship something, documentation lands in **exactly one of two
homes**, chosen by audience — with no duplication and no bloat. This file is the
canonical rule; it is pointed to from [`AGENTS.md`](../AGENTS.md) (so every repo
session follows it) and mirrored into the Notion **AI Knowledge Base** (so
Notion-started sessions follow it too).

## The two homes

| Home | Audience | Holds |
|---|---|---|
| **GitHub repo** — `docs/`, `ROADMAP.md` | engineers / agents | schema, migrations, code structure, APIs, architecture **decisions + rationale**, env/config, roadmap status |
| **Notion "Web Platform — Training & Strategy" database** | operators, hosts, non-engineers, training | how the live product **works / how to use / operate / moderate** it; worldview & strategy |

The Notion database lives under the **Web Community** page — data source
`collection://96c71490-1114-4c73-9547-88b5140126ed`.

**Authority order never changes:** running code + `supabase/migrations/` > repo
`docs/` > Notion. Every Notion training page carries a **"Source of truth"**
property pointing back to the relevant git doc.

## The router — apply to each thing planned or built

1. **Technical artifact?** (schema / migration / code / API / config) →
   update the relevant `docs/*.md`. If it's a **decision with rationale**, add an
   ADR to [`DECISIONS.md`](DECISIONS.md).
2. **Does it change how a human uses, operates, moderates, or understands the
   live product?** → update the matching **Notion training page** (create a new
   page *only* if it's a genuinely new subject area).
3. **Neither** (pure refactor, no operator impact) → **git only** (commit, + ADR
   if a decision was made). **No Notion page.**

Most features hit #1 every time and #2 sometimes.

## What goes where

| Change | git (technical) | Notion (instructional) |
|---|---|---|
| New table / migration | `DATABASE.md` (+ ADR) | only if it changes user/operator behavior |
| New role / permission | `GLOSSARY.md` + `ARCHITECTURE.md` (authz) | **Role & Permissions** page |
| New gamification mechanic | `GLOSSARY.md` + `DECISIONS.md` | **Crew Gamification** page |
| New user-facing feature flow | `ARCHITECTURE.md` / `DATABASE.md` (+ ADR) | the feature's how-to page (create if new) |
| Bug fix / refactor | commit (+ ADR if a decision) | — |
| Roadmap status change | `ROADMAP.md` | **MVP Build List** mirror page |

## Anti-bloat rules (Notion)

- **One page per durable subject area** — never per PR or per session. **Update in
  place.**
- **No changelogs or build-logs in Notion.** That is what git history / PRs are for.
- **Instructional voice, operator audience.** If a reader needs to read code to
  follow it, it belongs in git, not Notion.
- **Link, don't duplicate.** Reference the git doc; never copy schema/code into Notion.
- **Prune.** If a Notion page becomes a stale duplicate of a git doc, replace its
  body with a pointer or move it to the engineering archive.
- Always set **Type**, **Status**, and **Source of truth** on a training-DB page.

## Per-feature checklist (run when shipping)

- [ ] git: relevant `docs/*.md` updated (`DATABASE` / `ARCHITECTURE` / `GLOSSARY`)
- [ ] git: ADR added to `DECISIONS.md` **if a decision was made**
- [ ] git: `ROADMAP.md` / `BACKLOG.md` status updated
- [ ] Notion: training page updated **only if** user/operator-facing behavior changed
- [ ] Notion: page's "Source of truth" points back to the git doc
- [ ] Confirm the Notion page does not duplicate code/schema — it links to it

## Automation in Claude Code

This protocol is wired into the repo so the double-write is low-friction and hard to forget:

- **`AGENTS.md`** carries an inline summary of the router — it is injected into **every**
  Claude Code session in this repo, so the routing rule is always in context.
- **`/sync-docs` skill** (`.claude/skills/sync-docs/`) runs the full double-write on
  demand: it inspects the diff, updates the right `docs/*.md` + ADR + roadmap, updates or
  creates the matching Notion training page in place, commits, and pushes. Run it after
  designing/shipping a change (or just say "sync the docs").
- **Docs-drift Stop hook** (`.claude/hooks/docs-drift-check.sh`, registered in
  `.claude/settings.json`) prints a one-line reminder when the latest commit or the
  working tree changes code under `app/`, `lib/`, `components/`, or `supabase/migrations/`
  without a matching docs change. It never blocks — it just nudges you to run `/sync-docs`.

Together: you design and push; the hook catches undocumented code; `/sync-docs` (or any
session following `AGENTS.md`) performs the git + Notion update. The Notion half only fires
when the change is operator/user-facing, keeping the training database lean.

