# Tier 3 — Security hardening (RLS tests + convergence)

> Self-contained instructions for one web session. Big picture:
> [`../SESSION-PLAN.md`](../SESSION-PLAN.md). Read `AGENTS.md`,
> `docs/DOCS-PROTOCOL.md`, `docs/ARCHITECTURE.md`, and
> `docs/CAPABILITIES-AND-MOBILE.md` before starting.

## Why this tier

Many hot reads go through the service-role admin client, which **bypasses RLS**.
There is no RLS policy test coverage today. A verified authorization boundary is a
prerequisite for mobile and any AI-agent autonomy. With types now trustworthy
(Tier 2), lock the boundary and prove it with tests.

## Prerequisites

**Tiers 1–2 merged.** Branch from latest `main`. Understand the existing auth model
in `docs/ARCHITECTURE.md` (admin client usage, server session checks) and the
capability/RPC approach in `docs/CAPABILITIES-AND-MOBILE.md`.

## Scope

1. **RLS policy test suite** — create `supabase/tests/` (new dir) with
   `policies.test.ts`. For each sensitive table, write three cases:
   - **positive:** an authorized user can read/write what they should.
   - **negative:** an unauthorized user is rejected.
   - **scope:** a member sees only their own circle's rows, not others'.
   Cover at least: `profiles`, `circles`, `memberships`, `events`, `messages`,
   `posts`, `practices`. Use the anon/authenticated Supabase clients (not the admin
   client) so RLS is actually exercised.
2. **Wire into `npm test`.** Extend `vitest.config.ts` if needed and document how to
   point the suite at a local Supabase instance (these tests need a live DB; gate or
   skip gracefully if `SUPABASE` env isn't set so CI from Tier 1 doesn't break — or
   document a separate `test:rls` script).
3. **Converge the hottest reads off the admin client** onto `SECURITY DEFINER` RPCs +
   RLS:
   - `app/(main)/feed/page.tsx`
   - `app/(main)/circles/[slug]/page.tsx`
   - the profile view (people/handle page)
   Add a migration under `supabase/migrations/` defining the RPCs (returning data +
   capabilities), then swap those call sites from the admin client to the RPC/client.

## Key files

- `supabase/tests/policies.test.ts` (**new**), `supabase/tests/` fixtures
- `vitest.config.ts`
- `supabase/migrations/` (new RPC + policy migration)
- `app/(main)/feed/page.tsx`, `app/(main)/circles/[slug]/page.tsx`, profile page
- `lib/core/` (capabilities), `lib/contract/` (view-models) for typed RPC returns

## Validation

```bash
npx tsc --noEmit
npx eslint .
npm test                 # incl. policy tests, or document test:rls
```

Prove the negative cases actually fail when a policy is loosened (sanity-check the
test catches regressions).

## Docs

- Update `docs/CAPABILITIES-AND-MOBILE.md` and `docs/ARCHITECTURE.md` for the
  converged surfaces.
- ADR in `docs/DECISIONS.md` for the RLS-convergence approach and the policy-test
  strategy.
- Git-only.

## Definition of done

- Policy tests exist, pass, and demonstrably fail on a loosened policy.
- feed / circle-detail / profile reads no longer use the admin client.
- tsc/eslint/test green. ADR + docs updated. Draft PR opened.

## Kickoff prompt

> Read `docs/sessions/tier-3-security-rls.md` and complete it end to end: add an RLS
> policy test suite, converge feed/circle-detail/profile reads onto SECURITY DEFINER
> RPCs + RLS with a migration, update docs + ADR, validate, and open a draft PR.
</content>
