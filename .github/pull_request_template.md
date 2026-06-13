## What

<!-- One or two sentences: what this PR changes, in plain language. -->

## Why

<!-- The reason / the problem it solves. Link an issue or ADR if there is one. -->

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
