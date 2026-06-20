# Presentation Standard

> **Principle.** Everything we produce is presentation-ready in whatever surface it
> lands in: a GitHub PR, a terminal, Notion, an email, or the product itself. No raw
> dumps, no wall-of-text, no "I'll tidy it later." Polished is the default state, not a
> finishing step.

This applies to **every artifact an agent or routine creates** in this repo. Skills
(`/maintenance`, `/support-triage`, `/sync-docs`) and future sessions follow it.

## Universal rules
- **Lead with the answer.** First line = the outcome or status, then the detail.
- **Scannable over exhaustive.** Tables and short lists beat paragraphs. One idea per line.
- **Link, don't dump.** Point to the file/PR/source; don't paste long output inline.
- **Degrade gracefully.** Must read cleanly as plain text; never rely on color alone.
- **Consistent status legend** (use these exact glyphs everywhere):
  | Glyph | Meaning |
  | --- | --- |
  | ✅ | done / passing |
  | ⏳ | in progress |
  | ⚠️ | needs attention |
  | 🔴 | blocker / failing |
- **ISO dates** (`2026-06-02`), sentence-case headings, `code` for identifiers/paths.
- **No GitHub-flavored Markdown tables in `content/help/**`** (remark-gfm isn't installed
  there, use lists). Tables are fine in `docs/`.

## Markdown docs & reports
- Title → one-line summary (`> blockquote`) → body → **next steps / Needs your call**.
- Findings render as a table: **Severity · Item · Fix**. Sort worst-first.
- Keep headings shallow (H2/H3).

## Pull requests
- Body sections: **What · Why · Risk · How to verify.** Draft by default.
- Title: `type(scope): imperative summary` (Conventional Commits).

## ADRs (`docs/DECISIONS.md`)
- Keep the house format: **Status · Context · Decision · Consequences**, corroborated by
  the file/migration. Continue the `ADR-NNN` numbering.

## Emails (support drafts, `/support-triage`)
- Warm, concise, on-brand. Short paragraphs, no jargon, one clear ask or answer. Sign off
  as the community. Never send: drafts only.

## Notion (Training & Strategy DB)
- Native blocks, instructional voice, **link back to the git source of truth** via the
  page's "Source of truth" property. Never paste changelogs or raw code (per
  `docs/DOCS-PROTOCOL.md`).

## In-product UI
- Follow the repo's design language (`docs/DESIGN-LANGUAGE.md` / `docs/DESIGN.md`). Use the
  established tokens/components. **Never hardcode hex.** Match the surrounding density and
  idiom; new UI should look like it always belonged. (Remember: this is the non-standard
  Next.js, read `node_modules/next/dist/docs/` before writing Next code.)

## The test
Before calling anything done, ask: *if this were screenshotted into a deck or forwarded
to a customer right now, would it look intentional?* If not, it's not done.
