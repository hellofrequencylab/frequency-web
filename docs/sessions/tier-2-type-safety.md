# Tier 2 — Type-safety convergence

> Self-contained instructions for one web session. Big picture:
> [`../SESSION-PLAN.md`](../SESSION-PLAN.md). Read `AGENTS.md` and
> `docs/DOCS-PROTOCOL.md` before starting.

## Why this tier

~117 `as unknown as` double-casts and ~27 `any` annotations bypass the type checker,
mostly to paper over Supabase view/RPC return types. This hides real bugs and makes
refactors unsafe. The audit also found weak slug randomness and dangerous non-null
assertions in data paths.

## Prerequisites

**Tier 1 merged** (so the CI gate verifies this cleanup didn't regress tsc/eslint/test).
Branch from latest `main`.

## Scope

1. **Regenerate Supabase types.** Run the project's type-gen (`supabase gen types ...`
   — check `package.json`/`docs/START-HERE.md` for the exact command and whether it
   runs against local or linked) and commit the refreshed `lib/database.types.ts`. The
   goal: generated types match runtime so casts become unnecessary.
2. **Eliminate `as unknown as X`.** Replace with real interfaces or typed query
   helpers. Confirmed hotspots:
   - `components/feed/*` (e.g. `profile-feed.tsx`, `feed-list.tsx`)
   - `components/sidebar/right-sidebar.tsx`
   - `app/(main)/admin/*`
   - `app/(marketing)/beta/actions.ts`, `app/(studio)/studio/beta/actions.ts`
   - assorted `lib/*` (suppression, automations, practices)
   Where a view/RPC has no generated type, define an explicit interface next to the
   query and use it.
3. **Fix `catch (err: any)`.** Use `catch (err)` + `err instanceof Error ? err.message
   : String(err)` narrowing (~27 sites).
4. **Remove dangerous non-null assertions (`!`)** in data paths — e.g. in
   `components/marketing/blocks.tsx` and `app/(main)/crew/page.tsx`. Replace with
   optional chaining + guards / nullish coalescing.
5. **Slug generation.** In `app/(main)/admin/actions.ts`, replace the
   `Math.random().toString(36)` slug suffixes with `crypto.randomUUID()` (or `nanoid`)
   **and** add a DB uniqueness constraint + retry-on-conflict rather than relying on
   client-side collision avoidance. Add a migration under `supabase/migrations/` for
   the constraint if one isn't already present.

## Key files

- `lib/database.types.ts` (regenerated)
- `components/feed/*`, `components/sidebar/right-sidebar.tsx`
- `app/(main)/admin/actions.ts`, `app/(main)/admin/*`
- `app/(marketing)/beta/actions.ts`
- `supabase/migrations/` (slug-uniqueness migration, if needed)

## Validation

```bash
npx tsc --noEmit
npx eslint .
npm test
# sanity: count should drop a lot
grep -rn "as unknown as" app components lib | grep -v node_modules | wc -l
```

## Docs

- Document the Supabase type-generation workflow in `docs/ARCHITECTURE.md` or
  `docs/DATABASE.md` (exact command, when to re-run).
- ADR in `docs/DECISIONS.md` only if you change a convention (e.g. "generated types
  are the source of truth; no `as unknown as` in new code").
- Git-only; no Notion/help.

## Definition of done

- `as unknown as` count materially reduced; no new ones introduced.
- No `catch (err: any)` left in changed areas; non-null assertions in data paths
  removed; slug generation uses crypto + DB constraint.
- tsc/eslint/test green. Draft PR opened.

## Kickoff prompt

> Read `docs/sessions/tier-2-type-safety.md` and complete it end to end: regenerate
> Supabase types, replace `as unknown as`/`any`/non-null-assertion patterns with real
> types, fix the Math.random slug generation, document the type-gen workflow, validate,
> and open a draft PR.
</content>
