import { describe, it, expect } from 'vitest'
import {
  BETA_PRICING_ENDS_AT,
  COLLECTIVE_FOUNDING_ENDS_AT,
  COLLECTIVE_FOUNDING_ENDS_LABEL,
  collectiveFoundingOpen,
  FOUNDING_RATE_NOTE,
  FOUNDING_OPEN_ITEMS,
  foundingOpenFor,
  foundingOpenForPlan,
  isBetaPricingActive,
  effectiveCatalogAmounts,
} from './beta'

// Beta pricing window (ADR-811): the $19 Business / $49 Collective anchors auto-revert to list on the
// cutover. These are the PURE helpers behind that; the checkout key switch + the display are wired on top.
//
// THE CONSTANT IS OWNER-EDITABLE, SO NOTHING HERE PINS ITS VALUE (ADR-1060). This file used to assert
// `BETA_PRICING_ENDS_AT === '2026-09-01T07:00:00.000Z'` and to probe the window with hand-typed August
// dates. When the owner closed the window early on 2026-08-17 ("scratch the beta pricing and just charge
// full price"), both broke on a date rather than on a behaviour, and the fix would have been to re-type
// the same trap. Every instant below is now derived FROM the constant, so the next move of the cutover
// changes exactly one line of source and no test.

describe('the beta pricing window', () => {
  const cutover = Date.parse(BETA_PRICING_ENDS_AT)
  const DAY = 24 * 60 * 60 * 1000

  it('the cutover constant parses to a real instant', () => {
    expect(Number.isFinite(cutover)).toBe(true)
    // The SHAPE, not the value: a canonical UTC ISO-8601 instant that round-trips. A local-time or
    // zoneless string would parse in the server's zone and move the cutover by the deploy region.
    expect(BETA_PRICING_ENDS_AT).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(new Date(cutover).toISOString()).toBe(BETA_PRICING_ENDS_AT)
  })

  it('the window is CLOSED right now (owner closed it 2026-08-17: full price, no beta rate)', () => {
    // The decision itself, pinned as a consequence rather than as a date: whatever the constant says, the
    // live clock must be past it, so every surface shows list and every checkout charges list. This is
    // the assertion that fails if someone re-opens the window without an owner decision to do so.
    expect(isBetaPricingActive()).toBe(false)
    expect(cutover).toBeLessThanOrEqual(Date.now())
  })

  it('is active strictly BEFORE the cutover', () => {
    expect(isBetaPricingActive(new Date(cutover - 1000))).toBe(true)
    expect(isBetaPricingActive(new Date(cutover - DAY))).toBe(true)
    expect(isBetaPricingActive(new Date(cutover - 365 * DAY))).toBe(true)
  })

  it('is NOT active AT or AFTER the cutover (fail-safe to list, never under-charge)', () => {
    expect(isBetaPricingActive(new Date(cutover))).toBe(false) // boundary: the instant it ends
    expect(isBetaPricingActive(new Date(cutover + 1000))).toBe(false)
    expect(isBetaPricingActive(new Date(cutover + DAY))).toBe(false)
    expect(isBetaPricingActive(new Date(cutover + 365 * DAY))).toBe(false)
  })
})

describe('effectiveCatalogAmounts', () => {
  const anchored = { listCents: 7900, foundingCents: 4900 } // Collective: $49 beta under $79 list
  const flat = { listCents: 3900, foundingCents: 3900 } // Non Profit: no beta discount

  it('during beta: passes the real {founding, list} split through unchanged (the struck anchor)', () => {
    expect(effectiveCatalogAmounts(anchored, true)).toEqual({ listCents: 7900, foundingCents: 4900 })
  })

  it('after beta: list becomes the charged price and the anchor collapses to it (no strike)', () => {
    expect(effectiveCatalogAmounts(anchored, false)).toEqual({ listCents: 7900, foundingCents: 7900 })
  })

  it('a flat item (founding == list) is unchanged in both windows', () => {
    expect(effectiveCatalogAmounts(flat, true)).toEqual(flat)
    expect(effectiveCatalogAmounts(flat, false)).toEqual(flat)
  })
})

const INTRO_END_MS = Date.parse(COLLECTIVE_FOUNDING_ENDS_AT)
const BEFORE_INTRO_END = new Date(INTRO_END_MS - 1000)
const AT_INTRO_END = new Date(INTRO_END_MS)

describe('the Collective Founding intro end date (LIVE-995)', () => {
  it('is open one second before the end instant and closed at it', () => {
    expect(collectiveFoundingOpen(BEFORE_INTRO_END)).toBe(true)
    expect(collectiveFoundingOpen(AT_INTRO_END)).toBe(false)
    expect(foundingOpenFor('collective_base', false, AT_INTRO_END)).toBe(false)
    expect(foundingOpenForPlan('collective', false, AT_INTRO_END)).toBe(false)
  })

  it('does not close while the global beta window is open, and is not the site-wide beta end', () => {
    expect(foundingOpenFor('collective_base', true, AT_INTRO_END)).toBe(true)
    expect(COLLECTIVE_FOUNDING_ENDS_LABEL).toBe('January 1')
    expect(new Date(COLLECTIVE_FOUNDING_ENDS_AT).getUTCMonth()).toBe(0)
  })

  it('the shared note names the end date', () => {
    expect(FOUNDING_RATE_NOTE).toContain(COLLECTIVE_FOUNDING_ENDS_LABEL)
  })

  it('the static help articles name the same end date', async () => {
    const { readFileSync } = await import('node:fs')
    for (const f of ['content/help/spaces/collective.md', 'content/help/spaces/plans-and-pricing.md']) {
      expect(readFileSync(f, 'utf8')).toContain(COLLECTIVE_FOUNDING_ENDS_LABEL)
    }
  })
})

describe('foundingOpenFor (ADR-1760: a per-item Founding intro that outlives the beta window)', () => {
  it('while the window is open every item is founding', () => {
    expect(foundingOpenFor('business_base', true)).toBe(true)
    expect(foundingOpenFor(null, true)).toBe(true)
  })

  it('after the cutover only FOUNDING_OPEN_ITEMS stay on the founding price', () => {
    expect([...FOUNDING_OPEN_ITEMS]).toEqual(['collective_base'])
    expect(foundingOpenFor('collective_base', false, BEFORE_INTRO_END)).toBe(true)
    expect(foundingOpenFor('business_base', false)).toBe(false)
    expect(foundingOpenFor('nonprofit_collective', false)).toBe(false)
    expect(foundingOpenFor(null, false)).toBe(false)
    expect(foundingOpenFor(undefined, false)).toBe(false)
  })

  it('maps a Space plan to its catalog item: Collective open, Business and Network not', () => {
    expect(foundingOpenForPlan('collective', false, BEFORE_INTRO_END)).toBe(true)
    expect(foundingOpenForPlan('business', false)).toBe(false)
    expect(foundingOpenForPlan('network', false)).toBe(false)
    expect(foundingOpenForPlan('free', false)).toBe(false)
  })
})
