import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { BETA_GRACE_DEFAULT, betaGraceActive } from './beta'

// ── The beta-grace fuse (Phase 0, docs/VALUE-LADDER.md) ─────────────────────────────────────────
//
// featureGatesLive() = billingLive() && !betaGraceActive(beta_grace). `billing_live` is ALREADY true in
// production, so `beta_grace` is the only thing standing between today (every gate soft) and the day
// all 22 gates begin enforcing at once. It had NO ROW: the live value came from a constant in this
// repo, and nothing on any operator console showed it.
//
// These are guards on the SHAPE of that fuse, not on the date. The date is an owner call and may move.
// What must not happen again is the date living somewhere nobody can see it.

const MIGRATIONS = 'supabase/migrations'

describe('the grace window is a row an operator can see, not a constant nobody knew about', () => {
  it('a migration seeds beta_grace', () => {
    const seeded = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(`${MIGRATIONS}/${f}`, 'utf8'))
      .some((sql) => /insert\s+into\s+public\.pricing_settings[\s\S]*beta_grace/i.test(sql))
    expect(seeded, 'no migration seeds pricing_settings.beta_grace').toBe(true)
  })

  it('the seed matches the code default, so seeding changed no behaviour', () => {
    // The whole point of the seed is to make the EXISTING value visible. A seed that differed from
    // BETA_GRACE_DEFAULT would silently move the enforcement date for every Space on the platform,
    // which is exactly the class of surprise this phase exists to remove.
    const sql = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(`${MIGRATIONS}/${f}`, 'utf8'))
      .find((s) => /beta_grace/.test(s))
    expect(sql).toBeTruthy()
    expect(sql!).toContain(String(BETA_GRACE_DEFAULT.until))
  })

  it('the seed is insert-if-absent, so an operator edit is never clobbered', () => {
    const sql = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(`${MIGRATIONS}/${f}`, 'utf8'))
      .find((s) => /beta_grace/.test(s))!
    expect(sql).toMatch(/on\s+conflict\s*\(\s*key\s*\)\s*do\s+nothing/i)
  })
})

describe('the fail-safe direction of the window is never-lock-out', () => {
  it('an unparseable date keeps the gates SOFT rather than enforcing early', () => {
    expect(betaGraceActive({ until: 'not-a-date' })).toBe(true)
  })

  it('an explicit null is honoured as "no window" (the deliberate opt out)', () => {
    expect(betaGraceActive({ until: null })).toBe(false)
  })

  it('the boundary is exclusive: the date itself is the first ENFORCED day', () => {
    const until = '2026-09-01'
    expect(betaGraceActive({ until }, new Date('2026-08-31T23:59:59Z'))).toBe(true)
    expect(betaGraceActive({ until }, new Date('2026-09-01T00:00:00Z'))).toBe(false)
  })
})

describe('every limit honours the window, including the Journey publish cap', () => {
  it('checkJourneyPublish short-circuits while the gates are not live', () => {
    // 🔴 This was the ONE limit that bit during the beta. It compounded with BETA_OPEN_ACCESS, which
    // makes resolveCaller report 'crew': the Studio told a member they were Crew and the publish
    // button then refused them on the free allowance. Source-guarded because the check is an IO
    // function over four tables; what matters is that the short-circuit runs BEFORE any of them.
    const src = readFileSync('lib/journeys/publish-gate.ts', 'utf8')
    expect(src).toContain('if (!(await featureGatesLive())) return { ok: true }')

    // Scoped to the EXPORTED function's own body: the file also has a `countPublishedForOwner` helper
    // that reads journey_plans and is declared above, so a whole-file index comparison measures
    // declaration order rather than execution order.
    const body = src.slice(src.indexOf('export async function checkJourneyPublish'))
    const guard = body.indexOf('featureGatesLive')
    const firstRead = body.indexOf("from('journey_plans')")
    expect(guard).toBeGreaterThan(-1)
    expect(firstRead).toBeGreaterThan(-1)
    expect(guard, 'the grace check must run before the row read').toBeLessThan(firstRead)
  })
})

describe('the gate map has ONE source', () => {
  it('a migration clears the pricing_feature_gates override rows', () => {
    // lib/pricing/gates.ts states the contract in its header: the code map is the source of truth and
    // the table is an additive override layer. It had drifted into a second opinion — 6 of 11 rows
    // disagreed with the code, three of them LOWERING a Collective floor to Business. Zero rows means
    // the code map, exactly, which is what the tests assert and the surfaces derive from.
    const cleared = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(`${MIGRATIONS}/${f}`, 'utf8'))
      .some((sql) => /delete\s+from\s+public\.pricing_feature_gates/i.test(sql))
    expect(cleared).toBe(true)
  })
})
