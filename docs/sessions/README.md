# Session instructions

One self-contained instruction file per tier from [`../SESSION-PLAN.md`](../SESSION-PLAN.md).
Run them in order, **one Claude Code on the web session each**. Merge each tier's
PR before starting the next so the following session branches from updated `main`.

| Tier | File | Theme |
|------|------|-------|
| 1 | [`tier-1-quality-guardrails.md`](tier-1-quality-guardrails.md) | Lint baseline + CI gating |
| 2 | [`tier-2-type-safety.md`](tier-2-type-safety.md) | Type-safety convergence |
| 3 | [`tier-3-security-rls.md`](tier-3-security-rls.md) | RLS tests + convergence |
| 4 | [`tier-4-reliability.md`](tier-4-reliability.md) | Logging, email, cron |
| 5 | [`tier-5-beta-launch.md`](tier-5-beta-launch.md) | Apex cutover + partner loop |
| 6 | [`tier-6-analytics.md`](tier-6-analytics.md) | PMF instrumentation |
| 7 | [`tier-7-product-expansion.md`](tier-7-product-expansion.md) | AI consent, marketplace, density |

**To start a session**, paste:

> Read `docs/sessions/tier-N-<name>.md` and complete it end to end: implement,
> validate, update docs per `docs/DOCS-PROTOCOL.md`, and open a draft PR.

## Conventions every session must follow

- **Read first:** `AGENTS.md` (this is a modified Next.js 16 — read
  `node_modules/next/dist/docs/` before writing Next code) and
  `docs/DOCS-PROTOCOL.md` (route docs to git / help center / Notion by audience).
- **Validate before pushing:** `npx tsc --noEmit`, `npx eslint .`, `npm test` must
  all pass.
- **Ship a draft PR** on your session branch; don't push to `main`.
- **Auth model:** the service-role admin client is server-only — never import it
  into client components. See `docs/ARCHITECTURE.md`.
- **Schema source of truth** is `supabase/migrations/`; add a migration for any
  schema change and regenerate `lib/database.types.ts`.
</content>
