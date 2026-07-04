import { describe, it, expect } from 'vitest'
import {
  SPINE_ORDER,
  SPINE_META,
  PERSONAL_META,
  groupIntoSpine,
  groupPersonal,
  summaryFor,
  shouldFlatten,
  TIER_ORDER,
  tierForApp,
  groupIntoTiers,
  type RailTier,
} from './spine'
import type { AdminSlot } from './registry'

// The spine is pure browse metadata (docs/ADMIN-RAIL.md Phase 3). These lock the three decisions the
// drill-down depends on: fixed-order grouping, drop-empty, and the single-category collapse.

const app = (id: string, category: AdminSlot | 'element', label = id) => ({ id, category, label })

describe('SPINE_META', () => {
  it('covers every spine slot with a label + icon', () => {
    for (const slot of SPINE_ORDER) {
      expect(SPINE_META[slot], slot).toBeTruthy()
      expect(typeof SPINE_META[slot].label).toBe('string')
      expect(SPINE_META[slot].Icon).toBeTruthy()
    }
  })

  it('uses voice-canon noun labels with no em dashes', () => {
    for (const slot of SPINE_ORDER) {
      expect(SPINE_META[slot].label).not.toMatch(/—/)
    }
    expect(SPINE_META.place.label).toBe('Place & Time')
    expect(SPINE_META.basics.label).toBe('Basics')
  })
})

describe('groupIntoSpine', () => {
  it('emits populated slots in fixed SPINE_ORDER regardless of input order', () => {
    const apps = [app('d', 'danger'), app('b', 'people'), app('a', 'basics'), app('c', 'engage')]
    expect(groupIntoSpine(apps).map((g) => g.slot)).toEqual(['basics', 'people', 'engage', 'danger'])
  })

  it('drops empty slots (only populated categories survive)', () => {
    const groups = groupIntoSpine([app('a', 'basics')])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toEqual({ slot: 'basics', appIds: ['a'] })
  })

  it('preserves within-slot input order and ignores non-spine categories', () => {
    const apps = [app('a1', 'basics'), app('a2', 'basics'), app('el', 'element')]
    expect(groupIntoSpine(apps)).toEqual([{ slot: 'basics', appIds: ['a1', 'a2'] }])
  })

  it('returns [] for no apps', () => {
    expect(groupIntoSpine([])).toEqual([])
  })

  it('emits the personal "You" (account) slot FIRST, above the management spine (Phase 4)', () => {
    // account leads SPINE_ORDER, so a personal app + a management app group with 'You' on top.
    const apps = [app('acc', 'account'), app('b', 'basics'), app('p', 'people')]
    expect(groupIntoSpine(apps).map((g) => g.slot)).toEqual(['account', 'basics', 'people'])
  })
})

describe('personal "You" grouping (Phase 4)', () => {
  it('PERSONAL_META is the account slot chrome: labelled "You", no em dash', () => {
    expect(PERSONAL_META).toBe(SPINE_META.account)
    expect(PERSONAL_META.label).toBe('You')
    expect(PERSONAL_META.label).not.toMatch(/—/)
    expect(PERSONAL_META.Icon).toBeTruthy()
  })

  it('groupPersonal returns only the account-slot ids, in input order', () => {
    const apps = [app('acc1', 'account'), app('b', 'basics'), app('acc2', 'account')]
    expect(groupPersonal(apps)).toEqual(['acc1', 'acc2'])
  })

  it('groupPersonal is empty when there are no personal apps', () => {
    expect(groupPersonal([app('b', 'basics')])).toEqual([])
  })
})

describe('summaryFor', () => {
  it('joins the slot labels while short', () => {
    const apps = [app('a', 'basics', 'Circle settings'), app('b', 'basics', 'Page text')]
    expect(summaryFor('basics', apps)).toBe('Circle settings, Page text')
  })

  it('falls back to an N-settings count past three', () => {
    const apps = [1, 2, 3, 4].map((n) => app(`a${n}`, 'people', `P${n}`))
    expect(summaryFor('people', apps)).toBe('4 settings')
  })

  it('is empty for a slot with no catalog apps', () => {
    expect(summaryFor('layout', [app('a', 'basics', 'Basics')])).toBe('')
  })
})

// ── The three-tier rail axis (ADR-514 three-tier reorg) — pure grouping + the fail-safe defaults. ──
const tierApp = (
  id: string,
  category: AdminSlot | 'element',
  opts: { tier?: RailTier; priority?: number; personal?: boolean } = {},
) => ({ id, category, ...opts })

describe('tierForApp (fail-safe band defaults)', () => {
  it('honors an explicit tier tag', () => {
    expect(tierForApp({ category: 'basics', tier: 'standard' })).toBe('standard')
    expect(tierForApp({ category: 'people', tier: 'extra' })).toBe('extra')
  })

  it('defaults an untagged surface to primary', () => {
    expect(tierForApp({ category: 'people' })).toBe('primary')
    expect(tierForApp({ category: 'basics' })).toBe('primary')
  })

  it('forces an untagged danger surface to extra (never expanded at top)', () => {
    expect(tierForApp({ category: 'danger' })).toBe('extra')
  })

  it('an explicit tag still wins on a danger surface', () => {
    // A deliberately-tagged danger keeps its tag; only an UNTAGGED danger is forced to extra.
    expect(tierForApp({ category: 'danger', tier: 'extra' })).toBe('extra')
  })
})

describe('TIER_ORDER', () => {
  it('is standard → primary → extra (importance order, top to bottom)', () => {
    expect(TIER_ORDER).toEqual(['standard', 'primary', 'extra'])
  })
})

describe('groupIntoTiers', () => {
  it('partitions apps into bands in TIER_ORDER (standard, then primary, then extra)', () => {
    const apps = [
      tierApp('p', 'people', { tier: 'primary', priority: 10 }),
      tierApp('d', 'danger', { tier: 'extra', priority: 99 }),
      tierApp('b', 'basics', { tier: 'standard', priority: 10 }),
    ]
    expect(groupIntoTiers(apps).map((g) => g.tier)).toEqual(['standard', 'primary', 'extra'])
  })

  it('orders sections within a band by priority (first-appearance of a slot)', () => {
    const apps = [
      tierApp('crm', 'engage', { tier: 'primary', priority: 10 }),
      tierApp('ppl', 'people', { tier: 'primary', priority: 20 }),
      tierApp('svc', 'engage', { tier: 'primary', priority: 40 }),
      tierApp('mail', 'comms', { tier: 'primary', priority: 50 }),
    ]
    const groups = groupIntoTiers(apps)
    // engage first (its min priority 10), then people (20), then comms (50); engage folds crm+svc.
    expect(groups.map((g) => g.slot)).toEqual(['engage', 'people', 'comms'])
    expect(groups[0].appIds).toEqual(['crm', 'svc'])
  })

  it('keeps personal "You" leading its band (personal-before-management tiebreak)', () => {
    // A personal app and a management app tie on priority; the personal one leads.
    const apps = [
      tierApp('crm', 'engage', { tier: 'primary', priority: 10 }),
      tierApp('appearance', 'account', { tier: 'primary', priority: 10, personal: true }),
    ]
    const groups = groupIntoTiers(apps)
    expect(groups[0].slot).toBe('account')
    expect(groups.map((g) => g.slot)).toEqual(['account', 'engage'])
  })

  it('lets one slot span two bands with a unique (tier, slot) each (personal "You" split)', () => {
    const apps = [
      tierApp('profile', 'account', { tier: 'standard', priority: 10, personal: true }),
      tierApp('appearance', 'account', { tier: 'primary', priority: 10, personal: true }),
      tierApp('billing', 'account', { tier: 'extra', priority: 20, personal: true }),
    ]
    const groups = groupIntoTiers(apps)
    expect(groups.map((g) => `${g.tier}:${g.slot}`)).toEqual([
      'standard:account',
      'primary:account',
      'extra:account',
    ])
  })

  it('applies the fail-safe: an untagged danger app lands in the extra band', () => {
    const groups = groupIntoTiers([tierApp('d', 'danger')])
    expect(groups).toHaveLength(1)
    expect(groups[0].tier).toBe('extra')
    expect(groups[0].slot).toBe('danger')
  })

  it('ignores non-spine (element) apps', () => {
    expect(groupIntoTiers([tierApp('el', 'element', { tier: 'primary' })])).toEqual([])
  })

  it('returns [] for no apps', () => {
    expect(groupIntoTiers([])).toEqual([])
  })
})

describe('shouldFlatten', () => {
  const cat = (slot: AdminSlot) => ({ slot })

  it('flattens zero or one populated category (no extras)', () => {
    expect(shouldFlatten([])).toBe(true)
    expect(shouldFlatten([cat('basics')])).toBe(true)
  })

  it('shows the home list once there are two or more categories', () => {
    expect(shouldFlatten([cat('basics'), cat('place')])).toBe(false)
  })

  it('treats the operator Page group as a drill target', () => {
    // One category + the Page group = two targets → home list (do not collapse).
    expect(shouldFlatten([cat('basics')], { hasExtras: true })).toBe(false)
    // The Page group alone is one target → still flat.
    expect(shouldFlatten([], { hasExtras: true })).toBe(true)
  })
})
