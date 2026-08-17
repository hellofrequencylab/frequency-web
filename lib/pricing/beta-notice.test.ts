import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  afterBetaNoticeDismissed,
  afterBetaNoticeShown,
  asBetaNoticeMeter,
  betaNoticeCopy,
  betaNoticeKey,
  betaNoticeQuiet,
  betaStartLabel,
  BETA_NOTICE_CAP,
  BETA_NOTICE_HREF,
  BETA_NOTICE_QUIET_MS,
  shouldShowBetaNotice,
  targetForEntitlementKey,
  targetForGate,
  targetForTier,
  type BetaNoticeTarget,
} from './beta-notice'
import { FEATURE_GATES, mergeGate } from './gates'
import { betaGraceEndsAtMs } from './beta'

// THE BETA GRACE NOTICE (ADR-875). This is money + a member-facing promise, so the rules are locked
// here rather than left to the surface that renders them:
//
//   1. TIER DETECTION is DERIVED from the real gates / the real plan depth sets, never hand-mapped:
//      a Business feature says "Business tools", a Collective feature says "Collective tools".
//   2. SUPPRESSION: no notice when the grace window is closed, when checkout is not real, when the
//      viewer is already on that tier or above, when they already carry founding status, or when
//      their Space pays us off-Stripe (the three cash-paying Spaces, ADR-872).
//   3. THE COPY never claims a lock, because during grace nothing is locked, and it never carries a
//      hardcoded date, because the operator owns the date.
//   4. THE QUIET METER never nags: per TIER, capped, and quiet for a fixed window after a dismiss.

const SEPT = betaGraceEndsAtMs('2026-09-01') // the window's end, read the way the runtime reads it

// ── 1. Tier detection (derived from the real gates) ──────────────────────────────────────────────

describe('targetForGate (a feature names the tier its REAL gate sits on)', () => {
  it('a Business feature resolves to the Business tier', () => {
    // `space_crm` / `space_email` were the examples here until ADR-917 turned both into meters, so
    // the Business examples are now the two of the three named walls that sit at Business.
    expect(targetForGate(FEATURE_GATES.space_memberships)).toEqual({ axis: 'plan', tier: 'business' })
    expect(targetForGate(FEATURE_GATES.space_campaigns)).toEqual({ axis: 'plan', tier: 'business' })
  })

  it('a Collective feature resolves to the Collective tier', () => {
    expect(targetForGate(FEATURE_GATES.space_automation)).toEqual({ axis: 'plan', tier: 'collective' })
    expect(targetForGate(FEATURE_GATES.space_sms)).toEqual({ axis: 'plan', tier: 'collective' })
    // Revenue splits are the true Collective line of the collaboration ladder: hosting a few
    // collaborators is Business, sharing money with them automatically is the engine.
    expect(targetForGate(FEATURE_GATES.space_revenue_splits)).toEqual({ axis: 'plan', tier: 'collective' })
  })

  it('collaborator HOSTING resolves to Business, its new opening rung', () => {
    // Collaboration became a ladder rather than a wall: Business hosts a metered few, Collective is
    // unlimited. The notice must point at where the feature actually opens, not at the depth tier.
    expect(targetForGate(FEATURE_GATES.space_collaborators)).toEqual({ axis: 'plan', tier: 'business' })
  })

  it('a personal feature resolves to its membership tier', () => {
    expect(targetForGate(FEATURE_GATES.vault_cash_in)).toEqual({ axis: 'tier', tier: 'crew' })
    expect(targetForGate(FEATURE_GATES.vera_unlimited)).toEqual({ axis: 'tier', tier: 'crew' })
  })

  it('a DISABLED gate names nothing (it never binds, so nobody is using a paid tier through it)', () => {
    expect(targetForGate(FEATURE_GATES.space_full_website)).toBeNull() // enabled: false
  })

  it('a FREE floor names nothing, and neither does an absent gate', () => {
    expect(targetForGate(FEATURE_GATES.space_storefront)).toBeNull() // minEntitlement 'free'
    expect(targetForGate(null)).toBeNull()
    expect(targetForGate(undefined)).toBeNull()
  })

  it('follows an OPERATOR OVERRIDE rather than the code default (the gate is the source)', () => {
    // An operator raises the memberships floor to Collective: the notice must say Collective.
    const gate = mergeGate('space_memberships', { space_memberships: { minEntitlement: 'collective' } })
    expect(targetForGate(gate)).toEqual({ axis: 'plan', tier: 'collective' })
  })
})

describe('targetForTier (a bare tier floor IS the tier)', () => {
  it('crew resolves to the Crew tier', () => {
    expect(targetForTier('crew')).toEqual({ axis: 'tier', tier: 'crew' })
  })
  it('free names nothing', () => {
    expect(targetForTier('free')).toBeNull()
  })
  it('an unknown label names nothing (it ranks lowest, default-deny)', () => {
    expect(targetForTier('platinum')).toBeNull()
  })
})

describe('targetForEntitlementKey (the LOWEST plan whose depth set grants it)', () => {
  it('a Business-depth key resolves to Business', () => {
    expect(targetForEntitlementKey('crm')).toEqual({ axis: 'plan', tier: 'business' })
    expect(targetForEntitlementKey('email')).toEqual({ axis: 'plan', tier: 'business' })
    expect(targetForEntitlementKey('reporting')).toEqual({ axis: 'plan', tier: 'business' })
  })

  it('a Collective-depth key resolves to Collective, not to the higher plans that also grant it', () => {
    expect(targetForEntitlementKey('automation')).toEqual({ axis: 'plan', tier: 'collective' })
    expect(targetForEntitlementKey('team')).toEqual({ axis: 'plan', tier: 'collective' })
    expect(targetForEntitlementKey('program')).toEqual({ axis: 'plan', tier: 'collective' })
  })

  it('an Independent-only key resolves to Independent', () => {
    expect(targetForEntitlementKey('whitelabel')).toEqual({ axis: 'plan', tier: 'independent' })
  })

  it('an add-on-only key, an unknown key, and a blank key all name nothing', () => {
    expect(targetForEntitlementKey('crm.resonance')).toBeNull() // the AI add-on, in no tier base
    expect(targetForEntitlementKey('teleportation')).toBeNull()
    expect(targetForEntitlementKey('')).toBeNull()
  })
})

describe('betaNoticeKey (dismissal is per TIER, never per feature)', () => {
  it('every Crew capability shares one key', () => {
    expect(betaNoticeKey(targetForGate(FEATURE_GATES.vault_cash_in)!)).toBe('tier:crew')
    expect(betaNoticeKey(targetForGate(FEATURE_GATES.vera_unlimited)!)).toBe('tier:crew')
    expect(betaNoticeKey(targetForTier('crew')!)).toBe('tier:crew')
  })

  it('the two Space tiers keep separate keys', () => {
    expect(betaNoticeKey({ axis: 'plan', tier: 'business' })).toBe('plan:business')
    expect(betaNoticeKey({ axis: 'plan', tier: 'collective' })).toBe('plan:collective')
  })
})

// ── 2. Suppression ───────────────────────────────────────────────────────────────────────────────

describe('shouldShowBetaNotice', () => {
  const open = { graceActive: true, selling: true }

  it('shows for a below-tier viewer inside an open, selling window', () => {
    expect(shouldShowBetaNotice(open)).toBe(true)
  })

  it('is SUPPRESSED once the grace window has closed (the lock tease speaks then, not this)', () => {
    expect(shouldShowBetaNotice({ ...open, graceActive: false })).toBe(false)
  })

  it('is SUPPRESSED when checkout is not sellable (nothing to invite anyone into)', () => {
    expect(shouldShowBetaNotice({ ...open, selling: false })).toBe(false)
  })

  it('is SUPPRESSED for a viewer already on that tier or above', () => {
    expect(shouldShowBetaNotice({ ...open, alreadyEntitled: true })).toBe(false)
  })

  it('is SUPPRESSED for an account that already carries founding status', () => {
    expect(shouldShowBetaNotice({ ...open, isFounding: true })).toBe(false)
  })

  it('is SUPPRESSED for a Space with an ACTIVE off-Stripe billing agreement (the cash Spaces)', () => {
    expect(shouldShowBetaNotice({ ...open, hasBillingAgreement: true })).toBe(false)
  })

  it('THE THREE CASH SPACES: founding AND paying by cash, doubly suppressed', () => {
    expect(shouldShowBetaNotice({ ...open, isFounding: true, hasBillingAgreement: true })).toBe(false)
  })
})

// ── 3. The copy ──────────────────────────────────────────────────────────────────────────────────

describe('betaNoticeCopy (what a member actually reads)', () => {
  const business: BetaNoticeTarget = { axis: 'plan', tier: 'business' }
  const collective: BetaNoticeTarget = { axis: 'plan', tier: 'collective' }
  const crew: BetaNoticeTarget = { axis: 'tier', tier: 'crew' }

  it('names the Business tier honestly', () => {
    expect(betaNoticeCopy(business, SEPT)!.title).toBe('You are using Business tools')
  })

  it('names the Collective tier honestly', () => {
    expect(betaNoticeCopy(collective, SEPT)!.title).toBe('You are using Collective tools')
  })

  it('names the member tier by its canon label', () => {
    expect(betaNoticeCopy(crew, SEPT)!.title).toBe('You are using Crew tools')
  })

  it('states when memberships start, formatted FROM the operator window', () => {
    expect(betaNoticeCopy(collective, SEPT)!.body).toBe(
      'Memberships start September 1. Everything stays open until then.',
    )
    // Move the window and the sentence moves with it: nothing is pinned to a date literal.
    const october = betaGraceEndsAtMs('2026-10-15')
    expect(betaNoticeCopy(collective, october)!.body).toContain('October 15')
  })

  it('invites a Space to the Founding Business badge, and a member to the Founder badge', () => {
    expect(betaNoticeCopy(collective, SEPT)!.invite).toBe(
      'Take the yearly plan before September 1 to add the Founding Business badge to your Space.',
    )
    expect(betaNoticeCopy(crew, SEPT)!.invite).toBe(
      'Take the yearly plan before September 1 to add the Founder badge to your profile.',
    )
  })

  it('promises no beta rate, because there is not one to hold (ADR-1060)', () => {
    // The grace window (September 1) and the PRICING window are separate decisions on separate dates,
    // and the owner closed the pricing one early on 2026-08-17. This notice renders off the grace
    // window, so while it kept saying "hold the beta rate" it was offering a price the checkout had
    // already stopped charging. Asserted on the rendered copy, for every target, so the sentence
    // cannot quietly come back.
    for (const t of [business, collective, crew]) {
      const copy = betaNoticeCopy(t, SEPT)!
      expect(`${copy.title} ${copy.body} ${copy.invite} ${copy.cta}`).not.toMatch(/beta rate|beta price/i)
    }
  })

  it('points at the pricing page and carries the per-tier dismissal key', () => {
    const copy = betaNoticeCopy(collective, SEPT)!
    expect(copy.href).toBe(BETA_NOTICE_HREF)
    expect(copy.href).toBe('/pricing')
    expect(copy.key).toBe('plan:collective')
  })

  it('NEVER claims something is locked, blocked, or unavailable (nothing is, during grace)', () => {
    const targets: BetaNoticeTarget[] = [business, collective, crew, { axis: 'plan', tier: 'nonprofit' }]
    for (const t of targets) {
      const copy = betaNoticeCopy(t, SEPT)!
      const all = [copy.title, copy.body, copy.invite, copy.cta].join(' ').toLowerCase()
      for (const banned of ['locked', 'unlock', 'unavailable', 'blocked', 'upgrade to', 'expires']) {
        expect(all).not.toContain(banned)
      }
    }
  })

  it('carries no em dash anywhere (CONTENT-VOICE hard rule)', () => {
    const copy = betaNoticeCopy(collective, SEPT)!
    expect([copy.title, copy.body, copy.invite, copy.cta].join(' ')).not.toContain('—')
  })

  it('says NOTHING when the window has no readable date (no honest sentence without one)', () => {
    expect(betaNoticeCopy(collective, null)).toBeNull()
    expect(betaNoticeCopy(collective, undefined)).toBeNull()
    expect(betaNoticeCopy(collective, Number.NaN)).toBeNull()
  })
})

describe('betaStartLabel', () => {
  it('formats the window end in UTC, never the server local zone', () => {
    // 2026-09-01T00:00:00Z read in a US zone would print "August 31". It must not.
    expect(betaStartLabel(Date.parse('2026-09-01T00:00:00.000Z'))).toBe('September 1')
  })
  it('is null for a missing / unreadable instant', () => {
    expect(betaStartLabel(null)).toBeNull()
    expect(betaStartLabel(undefined)).toBeNull()
    expect(betaStartLabel(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

// ── 4. The quiet meter ───────────────────────────────────────────────────────────────────────────

describe('the quiet meter (a notice that never nags)', () => {
  const NOW = Date.parse('2026-08-01T00:00:00.000Z')

  it('a fresh key is not quiet', () => {
    expect(betaNoticeQuiet(undefined, NOW)).toBe(false)
    expect(betaNoticeQuiet({}, NOW)).toBe(false)
  })

  it('garbage in storage reads as a fresh meter, never as a crash', () => {
    expect(asBetaNoticeMeter('nope')).toEqual({ seen: 0, until: 0 })
    expect(asBetaNoticeMeter([1, 2])).toEqual({ seen: 0, until: 0 })
    expect(asBetaNoticeMeter({ seen: -4, until: 'soon' })).toEqual({ seen: 0, until: 0 })
  })

  it('counts appearances and goes quiet on its own once the cap is spent', () => {
    let meter = afterBetaNoticeShown(undefined, NOW)
    expect(meter.seen).toBe(1)
    expect(betaNoticeQuiet(meter, NOW)).toBe(false)
    meter = afterBetaNoticeShown(meter, NOW)
    meter = afterBetaNoticeShown(meter, NOW)
    expect(meter.seen).toBe(BETA_NOTICE_CAP)
    expect(betaNoticeQuiet(meter, NOW)).toBe(true)
  })

  it('a DISMISS silences it immediately for the whole window, then it may speak again', () => {
    const meter = afterBetaNoticeDismissed(NOW)
    expect(betaNoticeQuiet(meter, NOW)).toBe(true)
    expect(betaNoticeQuiet(meter, NOW + BETA_NOTICE_QUIET_MS - 1)).toBe(true)
    expect(betaNoticeQuiet(meter, NOW + BETA_NOTICE_QUIET_MS + 1)).toBe(false)
  })

  it('the quiet window is two weeks (long enough not to nag, short enough to still land)', () => {
    expect(BETA_NOTICE_QUIET_MS).toBe(14 * 24 * 60 * 60 * 1000)
  })
})

// ── 5. Source shape: no date literals, no lock language ──────────────────────────────────────────

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

/** Strip block + line comments so the assertions read CODE, not prose about the code. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('SOURCE SHAPE: the date is the operator’s, and the copy never claims a lock', () => {
  const SURFACES = [
    './beta-notice.ts',
    './beta-state.ts',
    './tease-gate.ts',
    '../../components/upsell/beta-grace-notice.tsx',
  ]

  it.each(SURFACES)('%s hardcodes no month name (every date formats from beta_grace)', (rel) => {
    const src = codeOnly(read(rel))
    expect(src).not.toMatch(/September|Sept\.|Aug(ust)?\b|Sep 1/i)
  })

  it.each(SURFACES)('%s carries no lock / unlock language in its strings', (rel) => {
    const src = codeOnly(read(rel))
    // Only string literals: the code may legitimately reference `locked` as a FIELD name.
    const literals = src.match(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g) ?? []
    const prose = literals.join(' ').toLowerCase()
    for (const banned of ['is locked', 'unlock', 'unavailable', 'upgrade to unlock']) {
      expect(prose).not.toContain(banned)
    }
  })

  it('the notice component is a note, not a wall (no modal, no muting, no interception)', () => {
    const src = codeOnly(read('../../components/upsell/beta-grace-notice.tsx'))
    expect(src).toContain('role="note"')
    expect(src).not.toMatch(/\brole="dialog"|aria-modal|pointer-events-none|preventDefault/)
  })
})
