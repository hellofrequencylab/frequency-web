---
name: sync-docs
description: Route and update documentation after designing or shipping a change. Technical docs go to git (docs/, DECISIONS.md, ROADMAP.md); instructional/operator docs go to the Notion "Web Platform — Training & Strategy" database, per docs/DOCS-PROTOCOL.md. Use after implementing a feature, fix, or decision, when the user says "sync docs" / "update the docs", or after a commit/push.
---

# /sync-docs — git ⇄ Notion documentation sync

Execute the documentation protocol in [`docs/DOCS-PROTOCOL.md`](../../../docs/DOCS-PROTOCOL.md).
Goal: every change is documented in exactly the right home, with no duplication and no Notion bloat.

## 1. Figure out what changed
- Run `git diff --name-only origin/main...HEAD` and `git status --porcelain` to see the
  shipped + working changes. Read the actual diffs for anything non-obvious.
- Summarize, in one line each: what was built/changed, and whether it (a) touches
  schema/code/architecture, and (b) changes how a human **uses / operates / moderates /
  understands** the live product.

## 2. Route it (the router)
For each change apply [`docs/DOCS-PROTOCOL.md`](../../../docs/DOCS-PROTOCOL.md):

**Always — technical → git:**
- Update the relevant `docs/*.md` (`DATABASE.md` for schema, `ARCHITECTURE.md` for
  structure/authz/cron/config, `GLOSSARY.md` for domain terms).
- If a **decision with rationale** was made, append an ADR to `docs/DECISIONS.md`
  (continue the ADR-NNN numbering; format: Status / Context / Decision / Consequences;
  cross-link the corroborating file or migration).
- Update `ROADMAP.md` / `docs/BACKLOG.md` status if a roadmap item moved.
- **Ground every claim in code/migrations.** If a doc and the code disagree, fix the doc.

**Only if it changes operator/user-facing behavior — instructional → Notion:**
- Target the **Web Platform — Training & Strategy** database, data source
  `collection://96c71490-1114-4c73-9547-88b5140126ed` (under the Web Community page).
- **Update the existing subject page in place** (Nexus Framework, Group Split Model,
  Role & Permissions, Janitor Role, Crew Gamification, Platform Research, MVP Build List,
  or another existing subject). **Create a new page only for a genuinely new subject.**
- Keep it **instructional** (operator/non-engineer voice). Never paste code, schema, or
  changelogs. Link back to the git doc.
- Set/confirm the page's `Type`, `Status`, and `Source of truth` properties.

**Neither (pure refactor, no operator impact):** git only. Do **not** create a Notion page.

## 3. Commit + push (git side)
- Commit the doc changes with a clear message describing what was routed where.
- Develop on the session's feature branch; `git push -u origin <branch>`.

## 4. Report
State plainly: which git docs were updated, whether an ADR was added, and which Notion
page was updated/created (or that none was needed and why). Flag any product-truth
question you could not resolve from the code rather than guessing.

## Anti-bloat reminders
One Notion page per durable subject — never per PR/session. Update in place. Link, don't
duplicate. If a Notion page has become a stale copy of a git doc, replace its body with a
pointer or move it to the engineering archive.
