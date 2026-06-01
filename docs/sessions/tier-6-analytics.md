# Tier 6 — Analytics & PMF instrumentation

> Self-contained instructions for one web session. Big picture:
> [`../SESSION-PLAN.md`](../SESSION-PLAN.md). Read `AGENTS.md`,
> `docs/DOCS-PROTOCOL.md`, and `docs/ENGAGEMENT-ARCHITECTURE.md` before starting.

## Why this tier

Beta is unobservable without metrics. WAM (weekly active members with ≥1
`practice.verified`) is the North Star; you need a live dashboard to judge whether
PMF holds.

## Prerequisites

**Tier 5 merged / beta live** (the dashboard needs real `engagement_events` data to be
meaningful — though you can build and test against seed data). Branch from latest
`main`.

## Scope

1. **Analytics queries** in `lib/analytics/` (next to `practice.ts`) and/or
   `lib/studio/analytics.ts`:
   - **WAM** — weekly count of members with ≥1 `practice.verified` event.
   - **7-day activation** — new members with ≥1 `practice.verified` in their first 7 days.
   - **Weekly practice-retention cohorts** — by signup week, % still active after
     1/2/4 weeks.
   - (nice to have) top circles by retention, top practices by adoption.
   Source from `engagement_events`. Keep queries server-side.
2. **Dashboard page** at `/studio/analytics` under `app/(studio)/`:
   - Render WAM trend, activation, and retention cohorts.
   - **Gate behind the existing admin role** (reuse the admin guard used by
     `app/(main)/admin/*`).
   - A chart lib may already be available in deps — check `package.json` before adding one.
3. Smoke-test against seed/live data.

## Key files

- `lib/analytics/*` (extend `practice.ts`), `lib/studio/analytics.ts`
- `app/(studio)/analytics/page.tsx` (**new**) + components
- existing admin-role guard

## Validation

```bash
npx tsc --noEmit
npx eslint .
npm test
```

Manually confirm the page renders and is admin-gated (non-admins blocked).

## Docs

- Note the metric definitions in `docs/ENGAGEMENT-ARCHITECTURE.md` (what WAM /
  activation / retention mean in code terms).
- **Operator how-to** ("how to read the analytics dashboard, what each metric means for
  decisions") → Notion per `docs/DOCS-PROTOCOL.md`; link back to the git doc.

## Definition of done

- `/studio/analytics` renders WAM + activation + retention cohorts, admin-gated.
- Metric definitions documented. tsc/eslint/test green. Draft PR opened.

## Kickoff prompt

> Read `docs/sessions/tier-6-analytics.md` and complete it end to end: build the
> admin-gated `/studio/analytics` dashboard (WAM, activation, retention cohorts) with
> queries in lib/analytics, document the metric definitions, validate, and open a draft PR.
</content>
