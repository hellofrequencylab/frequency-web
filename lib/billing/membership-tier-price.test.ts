import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  isValidTierPrice,
  membershipTierPriceError,
  MIN_PAID_TIER_PRICE_CENTS,
  FREE_TIER_PRICE_CENTS,
} from './membership-tier-price'

// THE MEMBERSHIP TIER PRICE FLOOR (LIVE-223). A paid membership now grants Crew, which makes the
// price of a tier a platform number and not only the operator's business: below the floor a tier
// stops being a membership and becomes a switch.

describe('isValidTierPrice', () => {
  it('free is always allowed - it grants no Crew and it is how an open membership runs', () => {
    expect(isValidTierPrice(FREE_TIER_PRICE_CENTS)).toBe(true)
    expect(FREE_TIER_PRICE_CENTS).toBe(0)
  })

  it('refuses everything between free and the floor - the degenerate $0.01 tier', () => {
    expect(isValidTierPrice(1)).toBe(false)
    expect(isValidTierPrice(100)).toBe(false)
    expect(isValidTierPrice(MIN_PAID_TIER_PRICE_CENTS - 1)).toBe(false)
  })

  it('allows the floor and everything above it - any price grants Crew (owner ruling)', () => {
    expect(isValidTierPrice(MIN_PAID_TIER_PRICE_CENTS)).toBe(true)
    expect(isValidTierPrice(500)).toBe(true)
    expect(isValidTierPrice(4400)).toBe(true)
  })

  it('refuses negatives and non-numbers rather than coercing them', () => {
    expect(isValidTierPrice(-1)).toBe(false)
    expect(isValidTierPrice(null)).toBe(false)
    expect(isValidTierPrice(undefined)).toBe(false)
    expect(isValidTierPrice(NaN)).toBe(false)
    expect(isValidTierPrice(Infinity)).toBe(false)
  })
})

describe('membershipTierPriceError', () => {
  it('is null for a valid price', () => {
    expect(membershipTierPriceError(0)).toBeNull()
    expect(membershipTierPriceError(500)).toBeNull()
  })

  it('names the number and the way out, in the house voice (no em dashes)', () => {
    const msg = membershipTierPriceError(50)
    expect(msg).toBe('A paid membership starts at $3. Set it to $0 to keep this tier free.')
    expect(msg).not.toContain('—')
  })
})

describe('the live tiers all clear the floor', () => {
  // Production on 2026-09-08: 4 tiers at 0c, 500c, 1000c and 4400c. Nothing to migrate.
  it('every price shape seen in production is valid', () => {
    for (const cents of [0, 500, 1000, 4400]) expect(isValidTierPrice(cents)).toBe(true)
  })
})

describe('the floor is wired into the write (OWN-067 / ADR-1512)', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('setMembershipTiers calls membershipTierPriceError on the normalized tiers (not in a comment)', () => {
    const src = strip(readFileSync(join(__dirname, '..', 'spaces', 'memberships.ts'), 'utf8'))
    const fn = src.slice(src.indexOf('export async function setMembershipTiers'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).toContain('membershipTierPriceError(t.priceCents)')
    expect(body).toContain('membershipTierPriceError(t.annualPriceCents')
    expect(src).toContain("from '@/lib/billing/membership-tier-price'")
  })

  it('this file no longer claims the floor is advisory', () => {
    const src = readFileSync(join(__dirname, 'membership-tier-price.ts'), 'utf8')
    expect(src).not.toContain('NOT YET WIRED')
    expect(src).toContain('WIRED INTO THE WRITE')
  })
})
