## What

<!-- One or two sentences: what this PR changes, in plain language. -->

## Why

<!-- The reason / the problem it solves. Link an issue or ADR if there is one. -->

## How to review (owner)

<!-- Plain-language, no code. See docs/REVIEWING-CHANGES.md. Fill in the 2-3 things to click on the
     Vercel Preview, e.g. "Open a Journey → hit the cover → confirm the Loom popup opens." -->

1. Wait for CI to go green (that IS the code review).
2. Open the **Vercel Preview** link above and check:
   - <!-- step 1 -->
   - <!-- step 2 -->
3. If it looks right, merge (or auto-merge ships it on green).

## How / files

<!-- Brief notes on the approach, or a table of the key files touched. -->

## Verification

<!-- How you know it works. Tick what you ran. -->

- [ ] `pnpm exec tsc --noEmit`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] Checked the Vercel preview

## Notes / follow-ups

<!-- Anything deferred, risks, or things a reviewer should know. -->

<!--
Reminders:
- `main` is protected — this merges via PR only, and merging deploys to production.
- Schema changes? Mirror them as a file in `supabase/migrations/`. Do NOT `supabase db push`
  (one shared DB — see docs/WORKFLOW.md → Scaling to a team).
- Docs: technical → git (docs/*.md, ADR in docs/DECISIONS.md) per docs/DOCS-PROTOCOL.md.
-->
