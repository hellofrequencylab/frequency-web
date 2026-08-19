import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { asBetaGrace, BETA_GRACE_DEFAULT, betaGraceActive } from './beta'

// ── The beta-grace fuse (Phase 0, docs/VALUE-LADDER.md) ─────────────────────────────────────────
//
// featureGatesLive() = billingLive() && !betaGraceActive(beta_grace). `billing_live` is ALREADY true in
// production, so `beta_grace` is the only thing standing between today (every gate soft) and the day
// all 22 gates begin enforcing at once. It had NO ROW: the live value came from a constant in this
// repo, and nothing on any operator console showed it.
//
// These are guards on the SHAPE of that fuse, not on the date. The date is an owner call and may move.
// What must not happen again is the date living somewhere nobody can see it.
//
// IT HAS SINCE MOVED, ALL THE WAY (ADR-1087, 2026-08-19): the owner removed the window rather than
// re-dating it, so the live row is `{"until": null}` and the fuse has already burned. The guards
// below still measure the shape, and one more now measures the removal itself, because "the row was
// cleared" is exactly the kind of fact that lives in a chat log until somebody re-seeds it by
// accident.

const MIGRATIONS = 'supabase/migrations'

/** Every migration that writes the `beta_grace` row, in APPLY ORDER (filename version ascending, the
 *  order `supabase db push` and a `db reset` replay use). The row now has a history rather than a
 *  single seed, so a test that reaches for "the migration" by first-match would silently assert
 *  against whichever one the filesystem handed back first. */
function graceMigrations(): { file: string; sql: string }[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => ({ file, sql: readFileSync(`${MIGRATIONS}/${file}`, 'utf8') }))
    .filter(({ sql }) => /beta_grace/.test(sql))
}

describe('the grace window is a row an operator can see, not a constant nobody knew about', () => {
  it('a migration seeds beta_grace', () => {
    const seeded = graceMigrations().some(({ sql }) =>
      /insert\s+into\s+public\.pricing_settings[\s\S]*beta_grace/i.test(sql),
    )
    expect(seeded, 'no migration seeds pricing_settings.beta_grace').toBe(true)
  })

  it('the FIRST write matched the code default, so seeding changed no behaviour', () => {
    // The whole point of the seed was to make the EXISTING value visible. A seed that differed from
    // BETA_GRACE_DEFAULT would silently have moved the enforcement date for every Space on the
    // platform, which is exactly the class of surprise that phase existed to remove.
    const seed = graceMigrations()[0]
    expect(seed).toBeTruthy()
    expect(seed!.sql).toContain(String(BETA_GRACE_DEFAULT.until))
  })

  it('the seed is insert-if-absent, so an operator edit is never clobbered', () => {
    expect(graceMigrations()[0]!.sql).toMatch(/on\s+conflict\s*\(\s*key\s*\)\s*do\s+nothing/i)
  })
})

describe('the grace window was REMOVED, and the migration that removed it says so in units the code reads', () => {
  // ADR-1087, owner decision 2026-08-19: "beta grace for private invites to the $490 year. everything
  // else removed." The surviving half is the per-Space price grant (spaces.beta_price_grant, ADR-1061),
  // which the CHECKOUT reads and which this row has nothing to do with. This row is the removed half.
  //
  // The assertions below deliberately measure the CONSEQUENCE rather than the words: the value the
  // last migration writes is parsed out and run through the REAL narrower and the REAL window
  // predicate, so a future edit that writes a plausible-looking but unhonoured shape (`{}`, a bare
  // string, a missing `until`) fails here instead of quietly restoring grace for everybody.
  const last = () => graceMigrations().at(-1)!

  it('the LAST word on the row is a removal, not another seed', () => {
    expect(last().file).toBe('20270314000000_beta_grace_removed.sql')
  })

  it('it OVERWRITES, because an insert-if-absent could never have moved an existing row', () => {
    expect(last().sql).toMatch(/on\s+conflict\s*\(\s*key\s*\)\s*do\s+update/i)
    expect(last().sql).not.toMatch(/on\s+conflict\s*\(\s*key\s*\)\s*do\s+nothing/i)
  })

  it('the value it writes is one the runtime honours as NO WINDOW', () => {
    const literal = last().sql.match(/'(\{[^']*"until"[^']*\})'::jsonb/)
    expect(literal, 'no jsonb literal carrying an `until` field found in the removal migration').toBeTruthy()
    const written = asBetaGrace(JSON.parse(literal![1]!))
    expect(written).toEqual({ until: null })
    // The gates bite from the moment this lands, at any clock, rather than on some later date.
    expect(betaGraceActive(written, new Date('2026-08-19T17:47:00Z'))).toBe(false)
    expect(betaGraceActive(written, new Date('2030-01-01T00:00:00Z'))).toBe(false)
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
