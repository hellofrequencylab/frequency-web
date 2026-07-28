import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  asBetaGrace,
  betaGraceActive,
  betaGraceEndsAtMs,
  BETA_GRACE_DEFAULT,
  type BetaGraceConfig,
} from './beta'
import { featureAllowed } from './gates'

// THE TWO SWITCHES (ADR-874). `billingLive()` answers "may we CHARGE". `featureGatesLive()` answers
// "do the paid feature GATES bite yet" = billing live AND the beta grace window has ended. They were
// ONE flag, and that conflation meant turning billing on to SELL also instantly REVOKED paid features
// from every free Space. This file locks the split so it cannot be re-conflated:
//
//   1. The PURE grace window (asBetaGrace / betaGraceActive), including the date boundary.
//   2. featureGatesLive() composed for real over a fake DB + a fake Stripe env: off when billing is
//      off, off during grace even with billing on, ON after the date, fail-safe GRANT on a read error,
//      and null/absent grace behaving as documented.
//   3. featureAllowed with the renamed `gatesLive` option.
//   4. A SOURCE-SHAPE guard: charging seams still consult billingLive, gating seams consult
//      featureGatesLive, and neither file reaches for the other's switch.
//
// BOUNDARY, stated once: the grace date is the first ENFORCED day. `until: '2026-09-01'` means the
// last soft day is Aug 31 and the gates begin on Sep 1 at 00:00 UTC.

// ── 1. The pure grace window ─────────────────────────────────────────────────────────────────────

describe('asBetaGrace (narrowing the beta_grace setting)', () => {
  it('an ABSENT value reads as the default window, not as no-grace', () => {
    // The fail-safe direction: a missing row must never enforce the gates early.
    expect(asBetaGrace(undefined)).toEqual(BETA_GRACE_DEFAULT)
    expect(asBetaGrace(null)).toEqual(BETA_GRACE_DEFAULT)
  })

  it('a MALFORMED value reads as the default window too', () => {
    expect(asBetaGrace('2026-09-01')).toEqual(BETA_GRACE_DEFAULT) // a bare string, not the object shape
    expect(asBetaGrace(42)).toEqual(BETA_GRACE_DEFAULT)
    expect(asBetaGrace([])).toEqual(BETA_GRACE_DEFAULT)
    expect(asBetaGrace({})).toEqual(BETA_GRACE_DEFAULT) // no `until` field at all
    expect(asBetaGrace({ until: 7 })).toEqual(BETA_GRACE_DEFAULT)
  })

  it('an EXPLICIT null / blank until is honoured as no grace window', () => {
    expect(asBetaGrace({ until: null })).toEqual({ until: null })
    expect(asBetaGrace({ until: '' })).toEqual({ until: null })
    expect(asBetaGrace({ until: '   ' })).toEqual({ until: null })
  })

  it('a real date passes through, trimmed', () => {
    expect(asBetaGrace({ until: '2026-09-01' })).toEqual({ until: '2026-09-01' })
    expect(asBetaGrace({ until: ' 2027-01-15 ' })).toEqual({ until: '2027-01-15' })
  })

  it('the code default is a real window on the beta cutover day (no migration seeds this row)', () => {
    expect(BETA_GRACE_DEFAULT.until).toBe('2026-09-01')
  })
})

describe('betaGraceEndsAtMs', () => {
  it('reads a bare calendar date as 00:00 UTC, never as local time', () => {
    expect(betaGraceEndsAtMs('2026-09-01')).toBe(Date.parse('2026-09-01T00:00:00.000Z'))
  })

  it('passes a full ISO instant through', () => {
    expect(betaGraceEndsAtMs('2026-09-01T07:00:00.000Z')).toBe(Date.parse('2026-09-01T07:00:00.000Z'))
  })

  it('is null for blank / unparseable input', () => {
    expect(betaGraceEndsAtMs(null)).toBeNull()
    expect(betaGraceEndsAtMs('')).toBeNull()
    expect(betaGraceEndsAtMs('not a date')).toBeNull()
  })
})

describe('betaGraceActive (the BOUNDARY: gates begin ON the date at 00:00 UTC)', () => {
  const grace: BetaGraceConfig = { until: '2026-09-01' }

  it('is OPEN the whole day BEFORE the date', () => {
    expect(betaGraceActive(grace, new Date('2026-08-31T00:00:00Z'))).toBe(true)
    expect(betaGraceActive(grace, new Date('2026-08-31T23:59:59.999Z'))).toBe(true)
  })

  it('is CLOSED at the instant the date begins, and after', () => {
    expect(betaGraceActive(grace, new Date('2026-09-01T00:00:00.000Z'))).toBe(false) // the boundary
    expect(betaGraceActive(grace, new Date('2026-09-01T00:00:00.001Z'))).toBe(false)
    expect(betaGraceActive(grace, new Date('2026-12-25T00:00:00Z'))).toBe(false)
  })

  it('no window configured = no grace (the gates follow billing exactly)', () => {
    expect(betaGraceActive({ until: null }, new Date('2020-01-01T00:00:00Z'))).toBe(false)
    expect(betaGraceActive({ until: '  ' }, new Date('2020-01-01T00:00:00Z'))).toBe(false)
    expect(betaGraceActive(null, new Date('2020-01-01T00:00:00Z'))).toBe(false)
    expect(betaGraceActive(undefined, new Date('2020-01-01T00:00:00Z'))).toBe(false)
  })

  it('FAIL-SAFE: an unparseable date keeps GRANTING, it never enforces early', () => {
    // Opposite direction from the pricing window on purpose: under-charging is a revenue problem,
    // wrongly revoking features is a trust problem, and this repo never locks anyone out.
    expect(betaGraceActive({ until: 'septemberish' }, new Date('2030-01-01T00:00:00Z'))).toBe(true)
  })
})

// ── 2. featureGatesLive() over a fake DB + fake Stripe env ───────────────────────────────────────
// settings.ts memoizes its reads with react `cache`, so each scenario resets the module registry and
// re-imports against freshly mocked dependencies (the pattern deferred-gates.test.ts uses).

interface Scenario {
  /** Stripe env keys present (billingEnabled). Default true. */
  stripeConfigured?: boolean
  /** The `billing_live` platform flag row. Default true. */
  billingLiveFlag?: boolean
  /** The `beta_grace` pricing_settings VALUE. `undefined` = no row at all. */
  graceRow?: unknown
  /** Make the pricing_settings read blow up (the fail-safe case). */
  settingsThrows?: boolean
}

async function loadSettings(s: Scenario) {
  vi.resetModules()
  vi.doMock('@/lib/billing/stripe', () => ({
    billingEnabled: () => s.stripeConfigured !== false,
  }))
  vi.doMock('@/lib/supabase/admin', () => ({
    createAdminClient: () => ({
      from: (table: string) => {
        if (table === 'platform_flags') {
          return {
            select: () => ({
              in: async () => ({
                data: [{ key: 'billing_live', value: s.billingLiveFlag !== false }],
              }),
            }),
          }
        }
        if (table === 'pricing_settings') {
          if (s.settingsThrows) throw new Error('pricing_settings is unreachable')
          return {
            select: async () => ({
              data: s.graceRow === undefined ? [] : [{ key: 'beta_grace', value: s.graceRow }],
              error: null,
            }),
          }
        }
        throw new Error(`unexpected table ${table}`)
      },
    }),
  }))
  return await import('./settings')
}

afterEach(() => {
  vi.useRealTimers()
  vi.doUnmock('@/lib/billing/stripe')
  vi.doUnmock('@/lib/supabase/admin')
  vi.resetModules()
})

describe('featureGatesLive()', () => {
  it('is OFF when billing is off, whatever the grace window says', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z')) // long past any grace date
    const { billingLive, featureGatesLive } = await loadSettings({
      billingLiveFlag: false,
      graceRow: { until: '2026-09-01' },
    })
    expect(await billingLive()).toBe(false)
    expect(await featureGatesLive()).toBe(false)
  })

  it('is OFF when the Stripe env keys are missing, even with the master switch on', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    const { featureGatesLive } = await loadSettings({
      stripeConfigured: false,
      billingLiveFlag: true,
      graceRow: { until: '2026-09-01' },
    })
    expect(await featureGatesLive()).toBe(false)
  })

  it('THE WHOLE POINT: billing ON + still inside the grace window = gates OFF', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-27T12:00:00Z')) // the beta, before Sept 1
    const { billingLive, featureGatesLive } = await loadSettings({
      billingLiveFlag: true,
      graceRow: { until: '2026-09-01' },
    })
    expect(await billingLive()).toBe(true) // checkout sells
    expect(await featureGatesLive()).toBe(false) // and nobody loses a feature
  })

  it('BOUNDARY: still off the day BEFORE the date, ON the day OF', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-31T23:59:59Z'))
    const before = await loadSettings({ billingLiveFlag: true, graceRow: { until: '2026-09-01' } })
    expect(await before.featureGatesLive()).toBe(false)

    vi.setSystemTime(new Date('2026-09-01T00:00:00Z'))
    const on = await loadSettings({ billingLiveFlag: true, graceRow: { until: '2026-09-01' } })
    expect(await on.featureGatesLive()).toBe(true)
  })

  it('is ON once the grace date has passed, with billing on', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-15T00:00:00Z'))
    const { featureGatesLive } = await loadSettings({
      billingLiveFlag: true,
      graceRow: { until: '2026-09-01' },
    })
    expect(await featureGatesLive()).toBe(true)
  })

  it('an EXPLICIT null grace behaves exactly as before the split: gates follow billing', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-27T12:00:00Z')) // deep in the beta
    const live = await loadSettings({ billingLiveFlag: true, graceRow: { until: null } })
    expect(await live.featureGatesLive()).toBe(true) // billing on, no window: the ladder bites

    const off = await loadSettings({ billingLiveFlag: false, graceRow: { until: null } })
    expect(await off.featureGatesLive()).toBe(false)
  })

  it('an ABSENT row uses the code default window (no migration required to get the beta shape)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-27T12:00:00Z'))
    const { getBetaGrace, featureGatesLive } = await loadSettings({ billingLiveFlag: true })
    expect(await getBetaGrace()).toEqual(BETA_GRACE_DEFAULT)
    expect(await featureGatesLive()).toBe(false) // billing sells, gates stay soft
  })

  it('FAIL-SAFE: a settings READ ERROR grants (grace still on), it never enforces early', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z')) // well past any grace date
    const { featureGatesLive } = await loadSettings({ billingLiveFlag: true, settingsThrows: true })
    // The clock says the window is long over, but the read failed, so we degrade to GRANT.
    expect(await featureGatesLive()).toBe(false)
  })
})

// ── 3. featureAllowed with the renamed option ────────────────────────────────────────────────────

describe('featureAllowed({ gatesLive })', () => {
  it('grants EVERYTHING while the gates are not live (billing off, or mid grace window)', async () => {
    expect(await featureAllowed('vault_cash_in', { tier: 'free' }, { gatesLive: false })).toBe(true)
    expect(await featureAllowed('vera_unlimited', { tier: 'free' }, { gatesLive: false })).toBe(true)
    expect(await featureAllowed('space_crm', { plan: 'free' }, { gatesLive: false })).toBe(true)
    expect(await featureAllowed('space_collaborators', { plan: 'free' }, { gatesLive: false })).toBe(true)
    expect(await featureAllowed('space_whitelabel', { plan: 'free' }, { gatesLive: false })).toBe(true)
  })

  it('enforces the ladder once the gates ARE live', async () => {
    // personal axis: free < crew < supporter
    expect(await featureAllowed('vault_cash_in', { tier: 'free' }, { gatesLive: true })).toBe(false)
    expect(await featureAllowed('vault_cash_in', { tier: 'crew' }, { gatesLive: true })).toBe(true)
    expect(await featureAllowed('vault_cash_in', { tier: 'supporter' }, { gatesLive: true })).toBe(true)
    // plan axis: free < business < collective ~ nonprofit ~ independent
    expect(await featureAllowed('space_crm', { plan: 'free' }, { gatesLive: true })).toBe(false)
    expect(await featureAllowed('space_crm', { plan: 'business' }, { gatesLive: true })).toBe(true)
    expect(await featureAllowed('space_collaborators', { plan: 'business' }, { gatesLive: true })).toBe(false)
    expect(await featureAllowed('space_collaborators', { plan: 'collective' }, { gatesLive: true })).toBe(true)
  })

  it('an undeclared feature is ungated either way', async () => {
    expect(await featureAllowed('never_declared', { tier: 'free' }, { gatesLive: true })).toBe(true)
    expect(await featureAllowed('never_declared', { tier: 'free' }, { gatesLive: false })).toBe(true)
  })
})

// ── 4. The SOURCE-SHAPE guard against re-conflation ──────────────────────────────────────────────
// The bug this ADR fixed is a one-word edit away from coming back: swap featureGatesLive() for
// billingLive() at a gating seam and every free Space loses its paid features the moment checkout
// opens. These assertions fail the build instead.

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

/** Strip block + line comments so the assertions read CODE, not prose about the code. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('SOURCE SHAPE: gating seams read featureGatesLive, charging seams read billingLive', () => {
  // Every seam that decides WHETHER A FEATURE IS ALLOWED. None may call billingLive().
  const GATING_SEAMS = [
    '../spaces/function-access.ts',
    '../spaces/seats.ts',
    '../spaces/provision.ts',
    '../ai/vera/usage-gate.ts',
    '../events/ticket-tiers.ts',
    '../events/space-event-access.ts',
    '../events/ticket-space-access.ts',
    './gamification-access.ts',
    './tease-gate.ts',
  ]

  // Every seam that decides WHETHER MONEY MOVES. None may call featureGatesLive().
  const CHARGING_SEAMS = [
    '../billing/space-plan-checkout.ts',
    '../billing/space-membership-checkout.ts',
    '../billing/operator-seats.ts',
    '../founding/business-checkout.ts',
    './space-plan.ts',
    './dunning.ts',
  ]

  it.each(GATING_SEAMS)('%s gates on featureGatesLive and never on billingLive', (rel) => {
    const src = codeOnly(read(rel))
    expect(src).toContain('featureGatesLive')
    expect(src).not.toMatch(/\bbillingLive\b/)
  })

  it.each(CHARGING_SEAMS)('%s charges on billingLive and never on featureGatesLive', (rel) => {
    const src = codeOnly(read(rel))
    expect(src).toMatch(/\bbillingLive\b/)
    expect(src).not.toContain('featureGatesLive')
  })

  it('featureAllowed takes `gatesLive`, never `billingLive`', () => {
    const src = codeOnly(read('./gates.ts'))
    expect(src).toContain('opts: { gatesLive: boolean }')
    expect(src).not.toMatch(/\bbillingLive\b/)
  })

  it('withinAllowance (the metered enforcement seam) takes `gatesLive` too', () => {
    const src = codeOnly(read('./feature-meters.ts'))
    expect(src).toContain('opts: { gatesLive: boolean }')
    expect(src).not.toMatch(/\bbillingLive\b/)
  })

  it('every featureAllowed / withinAllowance call site in the repo is handed gatesLive', async () => {
    // A repo-wide sweep: the ONE resolver that grants paid features must never be handed the charging
    // switch again, anywhere. Grep each call site with its argument lines and assert the switch that
    // shows up is the gating one.
    const { execFileSync } = await import('node:child_process')
    const root = fileURLToPath(new URL('../..', import.meta.url))
    const hits = execFileSync(
      'git',
      ['grep', '-n', '-A4', '-e', 'featureAllowed(', '-e', 'withinAllowance(', '--', '*.ts', '*.tsx'],
      { cwd: root, encoding: 'utf8' },
    )
    // Drop comment lines: the prose around these call sites legitimately names billingLive to explain
    // why it is NOT used here.
    const offenders = hits
      .split('\n')
      .filter((l) => /\bbillingLive\b/.test(l))
      .filter((l) => !/:\s*(\/\/|\*|\/\*)/.test(l.replace(/^[^:]*:\d+[-:]/, ': ')))
    expect(offenders).toEqual([])
  })
})
