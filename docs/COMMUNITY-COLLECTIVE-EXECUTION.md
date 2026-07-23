# Community Collective — execution cadence & phase gate

> **Status:** ✅ Active process (2026-07-23). How we work through
> [COMMUNITY-COLLECTIVE-BUILD-PLAN.md](COMMUNITY-COLLECTIVE-BUILD-PLAN.md) systematically without drifting
> off course. Source of truth for scope: [COMMUNITY-COLLECTIVE-STRATEGY.md](COMMUNITY-COLLECTIVE-STRATEGY.md)
> ([ADR-811](DECISIONS.md)).

## The cadence

- **One phase = one reviewable PR set.** Small, coherent, independently verifiable.
- **Everything ships behind `billing_live` OFF** until the single go-live flip (Phase 9). Every gate
  short-circuits to grant-all while OFF, so no live account changes mid-build.
- **After each major build, run the phase gate** (below). A phase is not "done" until it passes.

## Definition of Done (per phase)

1. The declared surfaces for the phase (and only those) are changed.
2. New pure logic is unit-tested; money- and tenancy-sensitive paths get an adversarial test.
3. The phase gate passes (green, or ⏳/⚠ only, never ✗).
4. Docs updated where the change is technical (this build plan + any ADR).
5. Committed with a message naming the phase; pushed; CI green.

## The phase gate (the "review all connections" program)

Run this battery after each major build. It reviews connections + wiring, legacy code, bugs, migrations,
and SEO/AIO, exactly the review the founder asked for.

```
pnpm lint            # style + unused + boundary problems
pnpm test            # unit + integration (vitest)
pnpm build           # RSC/route/type integrity (Next)
pnpm check:menu      # admin-menu contract (ADR-553)
pnpm check:canon     # member-copy canon (NAMING + CONTENT-VOICE)
pnpm check:seo       # SEO surface integrity
pnpm check:collective  # ← the Community Collective drift guard (scripts/check-collective.mjs)
# migrations/advisors: scripts/maintenance/sweep.mts (repo-vs-applied drift + Supabase advisors)
```

**`pnpm check:collective`** is the purpose-built guard (`scripts/check-collective.mjs`). It reads the
strategy doc as the north star and reports, per phase:

- **Wiring / connections** — a new tier (`collective` / `independent`) must be wired across *every* pricing
  surface (plans, catalog, ladders, settings). A half-wired tier is a **hard fail** (it would resolve
  inconsistently).
- **Legacy / off-plan** — the retired "no tier names" lock must never be reasserted as live canon (**hard
  fail**); stale prices in prose are tracked as **⚠ counts** so we always know what remains for the Phase 6
  rebrand.
- **Take-rate attribution** — once `fees.ts` is source-aware, **every** commerce call site must thread the
  source, or a self-booking could be billed a network rate (**hard fail**).
- **network_connected** — reports whether the in-collective/standalone switch is wired yet.
- **Migrations** — flags a CHECK-constraint gap when new tiers exist in code but not in the constrained columns.
- **SEO/AIO** — reports whether `llms.txt` + `site.ts` reflect the new model.

Legend: **✓** done · **⏳** phase not started (never fails) · **⚠** tracked follow-up · **✗** hard fail.

## Staying on course (anti-rabbit-trail)

1. **One north star.** `COMMUNITY-COLLECTIVE-STRATEGY.md` is the only source of scope. If a change is not
   traceable to a build-plan phase, it does not ship in this build.
2. **Log, don't chase.** A good idea or a bug found off-path is written into the build plan's follow-ups or a
   new issue, not built inline. The gate's ⚠ list is the running "known but deferred" ledger.
3. **The gate is the tripwire.** A ✗ means we wired something halfway or reasserted retired canon, stop and
   fix before moving on. ⏳ tells us exactly which phases remain, so progress is always legible.
4. **OFF until the end.** Because everything is behind `billing_live` OFF, there is never pressure to
   half-ship. We finish the whole arc, then flip once.

## References

[COMMUNITY-COLLECTIVE-STRATEGY.md](COMMUNITY-COLLECTIVE-STRATEGY.md) ·
[COMMUNITY-COLLECTIVE-BUILD-PLAN.md](COMMUNITY-COLLECTIVE-BUILD-PLAN.md) · [ADR-811](DECISIONS.md) ·
`scripts/check-collective.mjs` · `scripts/maintenance/sweep.mts`
