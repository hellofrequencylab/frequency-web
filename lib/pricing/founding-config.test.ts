import { describe, it, expect } from 'vitest'

// The PURE founding-config shaping (ADR-599/803): the fail-safe reader (asFoundingConfig) and the
// WRITE sanitizer the admin saveFoundingConfig action runs before persisting the `founding`
// pricing_settings key. Nothing here charges — a founding rate is a locked display value (ADR-362).

import {
  FOUNDING_DEFAULT,
  asFoundingConfig,
  sanitizeFoundingConfig,
  foundingBusinessSpotsRemaining,
} from './founding'

describe('asFoundingConfig (fail-safe reader)', () => {
  it('passes a well-formed config through unchanged', () => {
    const cfg = {
      member_one_time_cents: 30000,
      member_cap: 200,
      business_monthly_cents: 4900,
      business_take_bps: 300,
      business_city_cap: 25,
    }
    expect(asFoundingConfig(cfg)).toEqual(cfg)
  })

  it('falls back to the default for null / garbage / non-object input', () => {
    expect(asFoundingConfig(null)).toEqual(FOUNDING_DEFAULT)
    expect(asFoundingConfig(undefined)).toEqual(FOUNDING_DEFAULT)
    expect(asFoundingConfig('nope')).toEqual(FOUNDING_DEFAULT)
    expect(asFoundingConfig(42)).toEqual(FOUNDING_DEFAULT)
  })

  it('falls back per-field for a missing / negative / non-finite field', () => {
    const cfg = asFoundingConfig({
      member_one_time_cents: -5,
      member_cap: 'ten',
      business_monthly_cents: Infinity,
      // business_take_bps missing
      business_city_cap: 10,
    })
    expect(cfg.member_one_time_cents).toBe(FOUNDING_DEFAULT.member_one_time_cents)
    expect(cfg.member_cap).toBe(FOUNDING_DEFAULT.member_cap)
    expect(cfg.business_monthly_cents).toBe(FOUNDING_DEFAULT.business_monthly_cents)
    expect(cfg.business_take_bps).toBe(FOUNDING_DEFAULT.business_take_bps)
    expect(cfg.business_city_cap).toBe(10)
  })

  it('floors fractional amounts to whole non-negative cents', () => {
    const cfg = asFoundingConfig({
      member_one_time_cents: 25000.9,
      member_cap: 150.4,
      business_monthly_cents: 4900,
      business_take_bps: 300,
      business_city_cap: 25,
    })
    expect(cfg.member_one_time_cents).toBe(25000)
    expect(cfg.member_cap).toBe(150)
  })
})

describe('sanitizeFoundingConfig (write sanitizer)', () => {
  it('narrows + clamps the take-rate to at most 100% (10000 bps)', () => {
    const cfg = sanitizeFoundingConfig({
      member_one_time_cents: 25000,
      member_cap: 150,
      business_monthly_cents: 4900,
      business_take_bps: 50000, // a fat-finger 500% — clamp to 100%
      business_city_cap: 25,
    })
    expect(cfg.business_take_bps).toBe(10000)
  })

  it('leaves a valid take-rate untouched', () => {
    expect(sanitizeFoundingConfig({ ...FOUNDING_DEFAULT, business_take_bps: 300 }).business_take_bps).toBe(300)
  })

  it('returns the default for garbage input', () => {
    expect(sanitizeFoundingConfig(null)).toEqual(FOUNDING_DEFAULT)
    expect(sanitizeFoundingConfig({})).toEqual(FOUNDING_DEFAULT)
  })

  it('is idempotent on the default', () => {
    expect(sanitizeFoundingConfig(FOUNDING_DEFAULT)).toEqual(FOUNDING_DEFAULT)
  })
})

describe('foundingBusinessSpotsRemaining (unchanged)', () => {
  it('never goes negative and counts down against the city cap', () => {
    expect(foundingBusinessSpotsRemaining(FOUNDING_DEFAULT, 0)).toBe(25)
    expect(foundingBusinessSpotsRemaining(FOUNDING_DEFAULT, 25)).toBe(0)
    expect(foundingBusinessSpotsRemaining(FOUNDING_DEFAULT, 40)).toBe(0)
  })
})
