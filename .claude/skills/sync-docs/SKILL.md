---
name: sync-docs
description: Route and update documentation after designing or shipping a change. Technical docs go to git (docs/, DECISIONS.md, DEVELOPMENT-MAP.md); member-facing help goes to the public help center (content/help/ + CHANGELOG.md); instructional/operator docs go to the Notion "Web Platform, Training & Strategy" database, per docs/DOCS-PROTOCOL.md. Use after implementing a feature, fix, or decision, when the user says "sync docs" / "update the docs", or after a commit/push.
---

# /sync-docs: three-home documentation sync

Execute the documentation protocol in [`docs/DOCS-PROTOCOL.md`](../../../docs/DOCS-PROTOCOL.md).
Goal: every change is documented in exactly the right home(s), in the right voice, with no
duplication and no bloat. The three homes are **git** (engineers), the **public help
center** (members), and **Notion** (operators).

## 1. Figure out what changed
- Run `git diff --name-only origin/main...HEAD` and `git status --porcelain` to see the
  shipped + working changes. Read the actual diffs for anything non-obvious.
- Summarize, in one line each: what was built/changed, and whether it (a) touches
  schema/code/architecture, (b) changes how a **member uses** the product, and (c) changes
  how an **operator/host/moderator** runs or understands it.

## 2. Route it (the router)
For each change apply [`docs/DOCS-PROTOCOL.md`](../../../docs/DOCS-PROTOCOL.md):

**Always, technical to git:**
- Update the relevant `docs/*.md` (`DATABASE.md` for schema, `ARCHITECTURE.md` for
  structure/authz/cron/config, `GLOSSARY.md` for domain terms).
- If a **decision with rationale** was made, append an ADR to `docs/DECISIONS.md`
  (continue the ADR-NNN numbering; format: Status / Context / Decision / Consequences;
  cross-link the corroborating file or migration).
- Update `docs/DEVELOPMENT-MAP.md` build status if an item moved.
- **Ground every claim in code/migrations.** If a doc and the code disagree, fix the doc.

**Only if member-facing behavior changed, member to the help center:**
- Add/update the matching article in `content/help/<category>/<slug>.md` in **member
  voice** (front-matter per [HELP-CENTER.md](../../../docs/HELP-CENTER.md): `title`,
  `description`, `category`, `order`, `updated`, `audience`, `featureKeys`, `status`).
- Add a human-facing line to `docs/CHANGELOG.md` under `## [Unreleased]`.
- No GitHub-flavored tables (remark-gfm is not installed); use lists.

**Only if operator-facing behavior changed, instructional to Notion:**
- Target the **Web Platform, Training & Strategy** database, data source
  `collection://96c71490-1114-4c73-9547-88b5140126ed` (under the Web Community page).
- **Update the existing subject page in place.** Create a new page only for a genuinely
  new subject. Keep it instructional, never paste code/schema/changelogs, link back to the
  git doc. Set/confirm `Type`, `Status`, `Source of truth`, and `Last synced` (commit).

**None of the above (pure refactor):** git only. No help article, no Notion page.

## 3. Commit + push (git side)
- Commit the doc changes with a clear message describing what was routed where.
- Develop on the session's feature branch; `git push -u origin <branch>`.

## 4. Report
State plainly: which git docs were updated, whether an ADR was added, whether a help
article + CHANGELOG line were added, and which Notion page was updated/created (or that
none was needed and why). Flag any product-truth question you could not resolve from the
code rather than guessing.

## Anti-bloat reminders
One page per durable subject, never per PR/session. Update in place. Link, don't duplicate.
Right voice for the audience: code detail to git, member how-to to help, operator how-to to
Notion. If a help/Notion page has become a stale copy of a git doc, replace its body with a
pointer or archive it.
