# Tier 1 — Quality guardrails (lint baseline + CI gating)

> Self-contained instructions for one web session. Big picture:
> [`../SESSION-PLAN.md`](../SESSION-PLAN.md). Read `AGENTS.md` and
> `docs/DOCS-PROTOCOL.md` before starting.

## Why this tier is first

`eslint .` currently reports **94 errors + 79 warnings** of pre-existing debt, and
CI does **not** gate on `tsc`/`eslint`/`vitest` — only a non-blocking docs-drift
warning runs (`.github/workflows/docs-drift.yml`). Until that's fixed, every later
tier adds code into a blind spot. This tier establishes a clean lint baseline and a
blocking CI gate so nothing regresses after it.

## Prerequisites

None. This is the first tier. Branch from latest `main`.

## Scope

1. **Survey the failures.** Run `npx eslint .` and group the errors by rule. Expect
   mostly:
   - `@typescript-eslint/no-explicit-any`
   - `@typescript-eslint/no-unused-vars`
   - `react-hooks/set-state-in-effect` (at least
     `components/rooms/invite-to-room-button.tsx:34`)
2. **Fix the 94 errors.** Prefer real fixes (proper types, remove unused vars,
   restructure the effect). Warnings (e.g. `@next/next/no-img-element`) can stay or
   be triaged — they are not the goal here.
3. **Pragmatic policy for unavoidable `any`.** If a specific `any` genuinely can't be
   typed yet (deep Tier 2 work), downgrade `@typescript-eslint/no-explicit-any` to
   `'warn'` in `eslint.config.mjs` so it stops blocking — but do **not** mass-silence;
   real typing is Tier 2.
4. **Add a blocking CI workflow** `.github/workflows/ci.yml`, modeled on the existing
   `docs-drift.yml`. On `pull_request` to `main`, run:
   - `npm ci`
   - `npx tsc --noEmit`
   - `npx eslint .`
   - `npm test`
   Each step must fail the job on error (these **block** merges). Use
   `actions/setup-node@v4` with `cache: npm`.
5. **Leave docs-drift as-is** (it's intentionally non-blocking).

## Key files

- `eslint.config.mjs` — rule tuning
- `.github/workflows/ci.yml` — **new**
- `.github/workflows/docs-drift.yml` — reference only, don't change
- Scattered fixes across `app/`, `components/`, `lib/`

## Validation (must all pass before pushing)

```bash
npx tsc --noEmit
npx eslint .        # exit 0
npm test            # 20/20
```

## Docs

- Add an ADR to `docs/DECISIONS.md` recording the decision to gate CI on
  tsc+eslint+test and the lint policy (which rules are error vs warn, and why).
- Per `docs/DOCS-PROTOCOL.md` this is technical/git-only — no Notion, no help article.

## Definition of done

- `npx eslint .` exits 0 on a clean tree.
- New CI workflow is present and green on this PR.
- `npm test` still 20/20; `tsc` clean.
- ADR added.
- Draft PR opened on the session branch.

## Kickoff prompt

> Read `docs/sessions/tier-1-quality-guardrails.md` and complete it end to end: get
> `npx eslint .` to exit 0, add a blocking CI workflow (tsc + eslint + vitest)
> modeled on the existing docs-drift workflow, add an ADR, validate, and open a
> draft PR.
</content>
