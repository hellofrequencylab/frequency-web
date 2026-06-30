// CATALOG CONFIG — the OPERATOR-EDITABLE overlay over the Phase B code catalog (ADR-460, ADR-463,
// docs/PRICING-LADDER-PLAN.md §4/§1a). Phase B froze the seven catalog items (Pro base + the four
// add-ons + nonprofit seat + organization) with their {list,founding} x {month,year} amounts as CODE
// constants (lib/billing/pricing-keys.ts CATALOG). Phase C lets the operator override each item's
// MONTHLY list + founding amount (and the per-interval yearly override) from /admin/pricing, persisted
// to the existing `pricing_settings` kv store under the `catalog.<item>` key. No new table.
//
// THE OVERLAY CONTRACT. Every read FAILS SAFE to the code default: a missing/garbage override row
// yields the CATALOG amount, so a transient DB hiccup or the pre-config state never breaks a price
// display. The yearly amount derives from the monthly as TWO MONTHS FREE (yearlyFromMonthly) unless the
// operator sets an explicit yearly override (yearlyListCents / yearlyFoundingCents). This keeps the
// monthly the single number the operator usually touches, with the yearly editable when a plan wants a
// different annual deal.
//
// PURE shaping (resolveCatalogConfig) + a thin IO reader (loadCatalogConfig). The IO reads the same
// loadPricingSettings() map the rest of the console uses, so it shares the request cache. Server-only
// for the IO half (it reaches loadPricingSettings, which uses the admin client); the pure shaping is
// import-safe anywhere (the picker math reuses it).

import {
  catalogItem,
  catalogItems,
  yearlyFromMonthly,
  type BillingInterval,
  type CatalogAmounts,
  type CatalogItem,
  type CatalogItemKey,
  CATALOG_ITEM_KEYS,
} from '@/lib/billing/pricing-keys'
import { ADDON_KEYS, type AddonKey } from './plans'

// ── The operator-editable shape, per catalog item ─────────────────────────────────────────────────

/** The operator override for one catalog item's amounts. The MONTHLY list + founding are the headline
 *  numbers; the yearly amounts are OPTIONAL explicit overrides (null = derive two-months-free from the
 *  monthly). All cents, non-negative. */
export interface CatalogItemConfig {
  /** Monthly list anchor (the crossed-out price), in cents. */
  monthlyListCents: number
  /** Monthly founding price (the charged price), in cents. */
  monthlyFoundingCents: number
  /** Explicit yearly list override in cents, or null to derive (10x monthly = two months free). */
  yearlyListCents: number | null
  /** Explicit yearly founding override in cents, or null to derive. */
  yearlyFoundingCents: number | null
}

/** The resolved per-item config: the editable amounts PLUS the read-only catalog facts the surface
 *  needs (the label + whether the item bills per seat). */
export interface ResolvedCatalogItem extends CatalogItemConfig {
  key: CatalogItemKey
  label: string
  perSeat: boolean
  /** The resolved month + year amount grids (yearly derived when no override is set). */
  month: CatalogAmounts
  year: CatalogAmounts
}

/** The seat config (the bundled floor; per-seat amounts come from the catalog seat items). The bundled
 *  floor is the minimum licensed seats a nonprofit pays for (owner decision: 3-seat floor,
 *  PRICING-LADDER-PLAN §2). */
export interface SeatConfig {
  /** Minimum licensed seats a seat plan bills (the nonprofit bundled floor). */
  bundledFloor: number
}

export interface PwywConfig {
  /** The Supporter pay-what-you-want minimum, in cents. */
  minCents: number
  /** The suggested Supporter contribution, in cents. */
  suggestedCents: number
}

/** The full resolved catalog config the admin console + the picker read. */
export interface CatalogConfig {
  items: ResolvedCatalogItem[]
  seat: SeatConfig
  pwyw: PwywConfig
  /** Per-add-on enable flags (whether the add-on toggle is offered on the picker). */
  addonEnabled: Record<AddonKey, boolean>
}

// ── Defaults (the code catalog is the source of truth) ────────────────────────────────────────────

/** The default seat config: a 3-seat bundled floor (the owner-locked nonprofit floor). */
export const SEAT_CONFIG_DEFAULT: SeatConfig = { bundledFloor: 3 }

/** The default PWYW config: a $5 minimum, $12 suggested (the retired Supporter tier's old rate as the
 *  suggested anchor). */
export const PWYW_CONFIG_DEFAULT: PwywConfig = { minCents: 500, suggestedCents: 1200 }

/** The `pricing_settings` key for one catalog item's amount override. */
export function catalogConfigKey(item: CatalogItemKey): string {
  return `catalog.${item}`
}

/** The seat-config + PWYW + add-on-enable `pricing_settings` keys. */
export const SEAT_CONFIG_KEY = 'catalog.seat' as const
export const PWYW_CONFIG_KEY = 'catalog.pwyw' as const
export const ADDON_ENABLED_KEY = 'catalog.addon_enabled' as const

/** The CODE-DEFAULT config for one catalog item (the Phase B CATALOG amounts, no explicit yearly
 *  override so the yearly derives two-months-free). PURE. */
export function catalogItemConfigDefault(item: CatalogItem): CatalogItemConfig {
  return {
    monthlyListCents: item.month.listCents,
    monthlyFoundingCents: item.month.foundingCents,
    yearlyListCents: null,
    yearlyFoundingCents: null,
  }
}

// ── Pure resolution: a raw override (jsonb) + the code default -> a clean ResolvedCatalogItem ──────

function nonNegInt(v: unknown, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback
}

/** Narrow a raw jsonb value to a CatalogItemConfig, FAIL-SAFE to the code default. PURE. An absent or
 *  malformed field falls back to the default per-field, so a partial override is well-defined. */
export function asCatalogItemConfig(raw: unknown, fallback: CatalogItemConfig): CatalogItemConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback
  const o = raw as Record<string, unknown>
  const yl = o.yearlyListCents
  const yf = o.yearlyFoundingCents
  return {
    monthlyListCents: nonNegInt(o.monthlyListCents, fallback.monthlyListCents),
    monthlyFoundingCents: nonNegInt(o.monthlyFoundingCents, fallback.monthlyFoundingCents),
    yearlyListCents: yl == null ? null : nonNegInt(yl, 0),
    yearlyFoundingCents: yf == null ? null : nonNegInt(yf, 0),
  }
}

/** Build the resolved month + year amount grids from a config, deriving yearly two-months-free unless
 *  an explicit yearly override is set. PURE. */
export function amountsFromConfig(config: CatalogItemConfig): { month: CatalogAmounts; year: CatalogAmounts } {
  return {
    month: { listCents: config.monthlyListCents, foundingCents: config.monthlyFoundingCents },
    year: {
      listCents: config.yearlyListCents ?? yearlyFromMonthly(config.monthlyListCents),
      foundingCents: config.yearlyFoundingCents ?? yearlyFromMonthly(config.monthlyFoundingCents),
    },
  }
}

/** Resolve one catalog item's config from its raw override (or null for the code default). PURE. */
export function resolveCatalogItem(key: CatalogItemKey, raw: unknown): ResolvedCatalogItem {
  const item = catalogItem(key)
  const config = asCatalogItemConfig(raw, catalogItemConfigDefault(item))
  const { month, year } = amountsFromConfig(config)
  return { key, label: item.label, perSeat: item.perSeat, ...config, month, year }
}

/** Narrow a raw jsonb value to a SeatConfig, FAIL-SAFE to the default. PURE. */
export function asSeatConfig(raw: unknown): SeatConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return SEAT_CONFIG_DEFAULT
  const o = raw as Record<string, unknown>
  return { bundledFloor: Math.max(1, nonNegInt(o.bundledFloor, SEAT_CONFIG_DEFAULT.bundledFloor)) }
}

/** Narrow a raw jsonb value to a PwywConfig, FAIL-SAFE to the default. PURE. The suggested amount is
 *  clamped to at least the minimum so the surface never suggests below the floor. */
export function asPwywConfig(raw: unknown): PwywConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return PWYW_CONFIG_DEFAULT
  const o = raw as Record<string, unknown>
  const min = nonNegInt(o.minCents, PWYW_CONFIG_DEFAULT.minCents)
  const suggested = Math.max(min, nonNegInt(o.suggestedCents, PWYW_CONFIG_DEFAULT.suggestedCents))
  return { minCents: min, suggestedCents: suggested }
}

/** Narrow a raw jsonb value to the per-add-on enable map, FAIL-SAFE to ALL ENABLED (the add-ons ship
 *  on; an operator turns one off here). PURE. */
export function asAddonEnabled(raw: unknown): Record<AddonKey, boolean> {
  const out = {} as Record<AddonKey, boolean>
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  for (const key of ADDON_KEYS) out[key] = o[key] === false ? false : true
  return out
}

/** Resolve the WHOLE catalog config from a `pricing_settings` map. PURE — pass the loaded settings
 *  (loadPricingSettings()). FAIL-SAFE per field to the code defaults. */
export function resolveCatalogConfig(settings: Record<string, unknown>): CatalogConfig {
  const items = CATALOG_ITEM_KEYS.map((key) => resolveCatalogItem(key, settings[catalogConfigKey(key)]))
  return {
    items,
    seat: asSeatConfig(settings[SEAT_CONFIG_KEY]),
    pwyw: asPwywConfig(settings[PWYW_CONFIG_KEY]),
    addonEnabled: asAddonEnabled(settings[ADDON_ENABLED_KEY]),
  }
}

/** Read a single resolved catalog item's amounts for an interval from a settings map. PURE. */
export function resolvedAmounts(
  settings: Record<string, unknown>,
  key: CatalogItemKey,
  interval: BillingInterval,
): CatalogAmounts {
  const r = resolveCatalogItem(key, settings[catalogConfigKey(key)])
  return interval === 'month' ? r.month : r.year
}

// ── IO: the server-only loader (shares the loadPricingSettings request cache) ──────────────────────

/** Load the resolved catalog config (DB overrides merged over the code defaults). Server-only (reaches
 *  loadPricingSettings, which uses the admin client). FAIL-SAFE: any error yields the full code-default
 *  config, so prices always render. */
export async function loadCatalogConfig(): Promise<CatalogConfig> {
  // Imported lazily so the pure half of this module stays import-safe in client/test contexts.
  const { loadPricingSettings } = await import('./settings')
  try {
    const settings = await loadPricingSettings()
    return resolveCatalogConfig(settings)
  } catch {
    return resolveCatalogConfig({})
  }
}

/** The resolved catalog items keyed by item key, for callers that want a lookup. PURE. */
export function catalogConfigByKey(config: CatalogConfig): Record<CatalogItemKey, ResolvedCatalogItem> {
  const out = {} as Record<CatalogItemKey, ResolvedCatalogItem>
  for (const it of config.items) out[it.key] = it
  return out
}

/** The full code-default catalog config (no overrides), the seed both the admin console initial state
 *  and the tests build from. PURE. */
export function defaultCatalogConfig(): CatalogConfig {
  return {
    items: catalogItems().map((it) => ({
      key: it.key,
      label: it.label,
      perSeat: it.perSeat,
      ...catalogItemConfigDefault(it),
      month: it.month,
      year: it.year,
    })),
    seat: SEAT_CONFIG_DEFAULT,
    pwyw: PWYW_CONFIG_DEFAULT,
    addonEnabled: asAddonEnabled({}),
  }
}
