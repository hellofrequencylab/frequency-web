import { describe, it, expect } from 'vitest'

// Pricing ladder Phase C (ADR-463), the PURE surfaces math (no IO / no Stripe / no React): the
// catalog-config overlay (operator overrides over the Phase B code catalog, fail-safe per field) and
// the live loadout total (base + active add-ons + the per-seat Team multiplier, list anchor + founding
// charged). These are the numbers the admin console persists + the picker shows live, so they get
// direct unit coverage.

import {
  resolveCatalogConfig,
  resolveCatalogItem,
  catalogConfigByKey,
  defaultCatalogConfig,
  asCatalogItemConfig,
  asSeatConfig,
  asPwywConfig,
  asAddonEnabled,
  amountsFromConfig,
  catalogConfigKey,
  SEAT_CONFIG_KEY,
  PWYW_CONFIG_KEY,
  ADDON_ENABLED_KEY,
  SEAT_CONFIG_DEFAULT,
  PWYW_CONFIG_DEFAULT,
} from './catalog-config'
import {
  computeLoadoutTotal,
  normalizeAddons,
  addonCatalogKey,
  formatLoadoutCents,
  intervalSuffix,
} from './loadout'

// ── catalog-config: the operator overlay over the code catalog ─────────────────────────────────────

describe('resolveCatalogItem (override over the code default)', () => {
  it('falls back to the code catalog amounts when there is no override', () => {
    const biz = resolveCatalogItem('business_base', undefined)
    expect(biz.month.listCents).toBe(7900) // $79 founding anchor (ADR-591)
    expect(biz.month.foundingCents).toBe(4900) // $49 founding
    expect(biz.year.listCents).toBe(79000) // two months free off the list
    expect(biz.year.foundingCents).toBe(49000)
    expect(biz.perSeat).toBe(false)
  })

  it('applies a monthly override and derives the yearly as two months free', () => {
    const biz = resolveCatalogItem('business_base', { monthlyListCents: 3900, monthlyFoundingCents: 2400 })
    expect(biz.month.listCents).toBe(3900)
    expect(biz.month.foundingCents).toBe(2400)
    expect(biz.year.listCents).toBe(39000) // 10x
    expect(biz.year.foundingCents).toBe(24000)
  })

  it('honors an explicit yearly override instead of deriving it', () => {
    const biz = resolveCatalogItem('business_base', {
      monthlyListCents: 4900,
      monthlyFoundingCents: 4900,
      yearlyFoundingCents: 48000, // a deeper annual deal than 10x
    })
    expect(biz.year.foundingCents).toBe(48000)
    expect(biz.year.listCents).toBe(49000) // still derived (no list override)
  })

  it('is fail-safe per field: a partial / garbage override keeps the code default for the rest', () => {
    const biz = resolveCatalogItem('business_base', { monthlyFoundingCents: 1500, monthlyListCents: 'oops' })
    expect(biz.month.foundingCents).toBe(1500)
    expect(biz.month.listCents).toBe(7900) // garbage -> code default (the $79 anchor)
  })
})

describe('asCatalogItemConfig / config defaults', () => {
  const fallback = { monthlyListCents: 4900, monthlyFoundingCents: 4900, yearlyListCents: null, yearlyFoundingCents: null }
  it('returns the fallback for a null / non-object raw', () => {
    expect(asCatalogItemConfig(null, fallback)).toEqual(fallback)
    expect(asCatalogItemConfig([], fallback)).toEqual(fallback)
    expect(asCatalogItemConfig('x', fallback)).toEqual(fallback)
  })
  it('rounds and clamps negatives to the fallback', () => {
    const c = asCatalogItemConfig({ monthlyListCents: -5, monthlyFoundingCents: 1999.6 }, fallback)
    expect(c.monthlyListCents).toBe(4900) // negative -> fallback
    expect(c.monthlyFoundingCents).toBe(2000) // rounded
  })
})

describe('amountsFromConfig (two months free derivation)', () => {
  it('derives yearly as 10x monthly when no override', () => {
    const { year } = amountsFromConfig({ monthlyListCents: 2000, monthlyFoundingCents: 2000, yearlyListCents: null, yearlyFoundingCents: null })
    expect(year.listCents).toBe(20000)
    expect(year.foundingCents).toBe(20000)
  })
})

describe('seat / pwyw / add-on-enable config', () => {
  it('seat config defaults to a 3-seat bundled floor, min 1', () => {
    expect(asSeatConfig(undefined)).toEqual(SEAT_CONFIG_DEFAULT)
    expect(asSeatConfig({ bundledFloor: 5 }).bundledFloor).toBe(5)
    expect(asSeatConfig({ bundledFloor: 0 }).bundledFloor).toBe(1) // clamped to >= 1
  })
  it('pwyw config defaults and clamps the suggested to at least the minimum', () => {
    expect(asPwywConfig(undefined)).toEqual(PWYW_CONFIG_DEFAULT)
    const c = asPwywConfig({ minCents: 1000, suggestedCents: 500 })
    expect(c.minCents).toBe(1000)
    expect(c.suggestedCents).toBe(1000) // suggested raised to the floor
  })
  it('add-ons default to all-enabled; only an explicit false disables one (only AI now, ADR-472)', () => {
    expect(asAddonEnabled(undefined)).toEqual({ ai: true })
    expect(asAddonEnabled({ ai: false }).ai).toBe(false)
  })
})

describe('resolveCatalogConfig (whole config from a settings map)', () => {
  it('reads overrides by their pricing_settings keys, fail-safe to defaults', () => {
    const settings: Record<string, unknown> = {
      [catalogConfigKey('business_base')]: { monthlyListCents: 3900, monthlyFoundingCents: 2900 },
      [SEAT_CONFIG_KEY]: { bundledFloor: 4 },
      [PWYW_CONFIG_KEY]: { minCents: 700, suggestedCents: 1500 },
      [ADDON_ENABLED_KEY]: { branding: false },
    }
    const config = resolveCatalogConfig(settings)
    const byKey = catalogConfigByKey(config)
    expect(byKey.business_base.month.foundingCents).toBe(2900) // overridden
    expect(byKey.addon_ai.month.foundingCents).toBe(2000) // untouched -> code default
    expect(config.seat.bundledFloor).toBe(4)
    expect(config.pwyw.minCents).toBe(700)
    // Only AI is an add-on now (ADR-552); the ADDON_ENABLED override for a retired key is ignored.
    expect(config.addonEnabled.ai).toBe(true)
  })

  it('defaultCatalogConfig matches resolving an empty settings map', () => {
    const fromDefault = catalogConfigByKey(defaultCatalogConfig())
    const fromEmpty = catalogConfigByKey(resolveCatalogConfig({}))
    expect(fromDefault.business_base.month).toEqual(fromEmpty.business_base.month)
    expect(fromDefault.nonprofit_seat.year).toEqual(fromEmpty.nonprofit_seat.year)
  })
})

// ── loadout: the live Pro total ────────────────────────────────────────────────────────────────────

const ITEMS = catalogConfigByKey(defaultCatalogConfig())

describe('addonCatalogKey + normalizeAddons (re-tiered · ADR-472)', () => {
  it('maps the AI add-on key to its catalog item key', () => {
    expect(addonCatalogKey('ai')).toBe('addon_ai')
  })
  it('dedupes, drops the retired/unknown add-on keys, and honors the enabled map', () => {
    // marketing/team/branding are no longer AddonKeys; only ai survives.
    expect(normalizeAddons(['ai', 'ai', 'marketing', 'nope'] as string[])).toEqual(['ai'])
    expect(normalizeAddons(['ai'], { ai: false })).toEqual([]) // AI disabled by the operator map
    expect(normalizeAddons(['ai'], { ai: true })).toEqual(['ai'])
  })
})

describe('computeLoadoutTotal (collapsed · ADR-552)', () => {
  it('Business base alone, monthly = $49 founding under a $79 list anchor (ADR-591)', () => {
    const t = computeLoadoutTotal(ITEMS, [], 'month')
    expect(t.foundingCents).toBe(4900)
    expect(t.listCents).toBe(7900)
    expect(t.savingsCents).toBe(3000) // $79 list - $49 founding
    expect(t.lines).toHaveLength(1)
    expect(t.lines[0].isBase).toBe(true)
    expect(t.lines[0].key).toBe('business_base')
  })

  it('Business + the AI add-on = $69 founding monthly ($49 base + $20 AI)', () => {
    const t = computeLoadoutTotal(ITEMS, ['ai'], 'month')
    expect(t.foundingCents).toBe(4900 + 2000) // $69
    expect(t.lines).toHaveLength(2)
    expect(t.lines[1].key).toBe('addon_ai')
    expect(t.lines[1].quantity).toBe(1) // the AI add-on is not per-seat
  })

  it('the retired add-on keys are ignored (only AI layers on the base)', () => {
    const t = computeLoadoutTotal(ITEMS, ['marketing', 'team', 'branding'] as string[], 'month')
    expect(t.foundingCents).toBe(4900) // base only; the retired keys add nothing
    expect(t.lines).toHaveLength(1)
  })

  it('yearly is two months free (10x the monthly total)', () => {
    const monthly = computeLoadoutTotal(ITEMS, ['ai'], 'month')
    const yearly = computeLoadoutTotal(ITEMS, ['ai'], 'year')
    expect(yearly.foundingCents).toBe(monthly.foundingCents * 10)
    expect(yearly.listCents).toBe(monthly.listCents * 10)
  })
})

describe('formatLoadoutCents + intervalSuffix', () => {
  it('drops cents for whole dollars, keeps them otherwise', () => {
    expect(formatLoadoutCents(1900)).toBe('$19')
    expect(formatLoadoutCents(1950)).toBe('$19.50')
  })
  it('suffixes the interval plainly', () => {
    expect(intervalSuffix('month')).toBe('/mo')
    expect(intervalSuffix('year')).toBe('/yr')
  })
})
