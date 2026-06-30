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
  it('falls back to the Phase B code catalog amounts when there is no override', () => {
    const pro = resolveCatalogItem('pro_base', undefined)
    expect(pro.month.listCents).toBe(2900) // $29 list
    expect(pro.month.foundingCents).toBe(1900) // $19 founding
    expect(pro.year.listCents).toBe(29000) // two months free
    expect(pro.year.foundingCents).toBe(19000)
    expect(pro.perSeat).toBe(false)
  })

  it('applies a monthly override and derives the yearly as two months free', () => {
    const pro = resolveCatalogItem('pro_base', { monthlyListCents: 3900, monthlyFoundingCents: 2400 })
    expect(pro.month.listCents).toBe(3900)
    expect(pro.month.foundingCents).toBe(2400)
    expect(pro.year.listCents).toBe(39000) // 10x
    expect(pro.year.foundingCents).toBe(24000)
  })

  it('honors an explicit yearly override instead of deriving it', () => {
    const pro = resolveCatalogItem('pro_base', {
      monthlyListCents: 2900,
      monthlyFoundingCents: 1900,
      yearlyFoundingCents: 18000, // a deeper annual deal than 10x
    })
    expect(pro.year.foundingCents).toBe(18000)
    expect(pro.year.listCents).toBe(29000) // still derived (no list override)
  })

  it('is fail-safe per field: a partial / garbage override keeps the code default for the rest', () => {
    const pro = resolveCatalogItem('pro_base', { monthlyFoundingCents: 1500, monthlyListCents: 'oops' })
    expect(pro.month.foundingCents).toBe(1500)
    expect(pro.month.listCents).toBe(2900) // garbage -> code default
  })
})

describe('asCatalogItemConfig / config defaults', () => {
  const fallback = { monthlyListCents: 2900, monthlyFoundingCents: 1900, yearlyListCents: null, yearlyFoundingCents: null }
  it('returns the fallback for a null / non-object raw', () => {
    expect(asCatalogItemConfig(null, fallback)).toEqual(fallback)
    expect(asCatalogItemConfig([], fallback)).toEqual(fallback)
    expect(asCatalogItemConfig('x', fallback)).toEqual(fallback)
  })
  it('rounds and clamps negatives to the fallback', () => {
    const c = asCatalogItemConfig({ monthlyListCents: -5, monthlyFoundingCents: 1999.6 }, fallback)
    expect(c.monthlyListCents).toBe(2900) // negative -> fallback
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
  it('add-ons default to all-enabled; only an explicit false disables one', () => {
    expect(asAddonEnabled(undefined)).toEqual({ marketing: true, ai: true, team: true, branding: true })
    expect(asAddonEnabled({ ai: false }).ai).toBe(false)
    expect(asAddonEnabled({ ai: false }).marketing).toBe(true)
  })
})

describe('resolveCatalogConfig (whole config from a settings map)', () => {
  it('reads overrides by their pricing_settings keys, fail-safe to defaults', () => {
    const settings: Record<string, unknown> = {
      [catalogConfigKey('pro_base')]: { monthlyListCents: 3900, monthlyFoundingCents: 2900 },
      [SEAT_CONFIG_KEY]: { bundledFloor: 4 },
      [PWYW_CONFIG_KEY]: { minCents: 700, suggestedCents: 1500 },
      [ADDON_ENABLED_KEY]: { branding: false },
    }
    const config = resolveCatalogConfig(settings)
    const byKey = catalogConfigByKey(config)
    expect(byKey.pro_base.month.foundingCents).toBe(2900)
    expect(byKey.addon_marketing.month.foundingCents).toBe(2000) // untouched -> code default
    expect(config.seat.bundledFloor).toBe(4)
    expect(config.pwyw.minCents).toBe(700)
    expect(config.addonEnabled.branding).toBe(false)
    expect(config.addonEnabled.marketing).toBe(true)
  })

  it('defaultCatalogConfig matches resolving an empty settings map', () => {
    const fromDefault = catalogConfigByKey(defaultCatalogConfig())
    const fromEmpty = catalogConfigByKey(resolveCatalogConfig({}))
    expect(fromDefault.pro_base.month).toEqual(fromEmpty.pro_base.month)
    expect(fromDefault.organization.year).toEqual(fromEmpty.organization.year)
  })
})

// ── loadout: the live Pro total ────────────────────────────────────────────────────────────────────

const ITEMS = catalogConfigByKey(defaultCatalogConfig())

describe('addonCatalogKey + normalizeAddons', () => {
  it('maps an add-on key to its catalog item key', () => {
    expect(addonCatalogKey('marketing')).toBe('addon_marketing')
    expect(addonCatalogKey('team')).toBe('addon_team')
  })
  it('dedupes, drops unknowns, and honors the enabled map', () => {
    expect(normalizeAddons(['marketing', 'marketing', 'nope'] as string[])).toEqual(['marketing'])
    expect(normalizeAddons(['marketing', 'ai'], { marketing: true, ai: false, team: true, branding: true })).toEqual(['marketing'])
  })
})

describe('computeLoadoutTotal', () => {
  it('Pro base alone, monthly = $19 founding under a $29 list', () => {
    const t = computeLoadoutTotal(ITEMS, [], 'month')
    expect(t.foundingCents).toBe(1900)
    expect(t.listCents).toBe(2900)
    expect(t.savingsCents).toBe(1000)
    expect(t.lines).toHaveLength(1)
    expect(t.lines[0].isBase).toBe(true)
  })

  it('the coach loadout (Pro + Marketing) = $39 founding monthly', () => {
    const t = computeLoadoutTotal(ITEMS, ['marketing'], 'month')
    expect(t.foundingCents).toBe(1900 + 2000) // $39
    expect(t.lines).toHaveLength(2)
  })

  it('the small-business loadout (Pro + Marketing + AI) = $59 founding monthly', () => {
    const t = computeLoadoutTotal(ITEMS, ['marketing', 'ai'], 'month')
    expect(t.foundingCents).toBe(1900 + 2000 + 2000) // $59
  })

  it('everything (Pro + all four add-ons), Team x1 = $69 founding monthly', () => {
    const t = computeLoadoutTotal(ITEMS, ['marketing', 'ai', 'team', 'branding'], 'month', 1)
    expect(t.foundingCents).toBe(1900 + 2000 + 2000 + 900 + 3000) // $69
  })

  it('the Team add-on multiplies by the seat count', () => {
    const one = computeLoadoutTotal(ITEMS, ['team'], 'month', 1)
    const three = computeLoadoutTotal(ITEMS, ['team'], 'month', 3)
    expect(three.foundingCents - one.foundingCents).toBe(900 * 2) // two extra seats x $9
    const teamLine = three.lines.find((l) => l.key === 'addon_team')!
    expect(teamLine.quantity).toBe(3)
    expect(teamLine.foundingCents).toBe(2700)
  })

  it('yearly is two months free (10x the monthly total)', () => {
    const monthly = computeLoadoutTotal(ITEMS, ['marketing'], 'month')
    const yearly = computeLoadoutTotal(ITEMS, ['marketing'], 'year')
    expect(yearly.foundingCents).toBe(monthly.foundingCents * 10)
    expect(yearly.listCents).toBe(monthly.listCents * 10)
  })

  it('a seat count below 1 floors to 1 (never zero-charges the base)', () => {
    const t = computeLoadoutTotal(ITEMS, ['team'], 'month', 0)
    expect(t.lines.find((l) => l.key === 'addon_team')!.quantity).toBe(1)
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
