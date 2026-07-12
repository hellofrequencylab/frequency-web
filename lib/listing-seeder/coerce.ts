// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFIEDS & HOUSING SEEDER — the PURE extraction coercion + grounding layer
// (Phase 0). Mirrors lib/importer/extract/coerce.ts: the model returns a raw,
// untrusted shape; this layer coerces it into a ListingDraft AND builds the
// first-pass ProvenanceLedger, grounding every field against the pasted block.
//
// GROUNDING GATE (reused from the importer): a field the model labeled 'fact' whose
// cited snippet is NOT actually present in the paste is DOWNGRADED to 'inferred' and
// its confidence capped, so the model cannot launder a guess into a fact by claiming
// a citation that does not exist. The commercial facts that matter most here are the
// PRICE and the CONTACT (price_note / rent / deposit / contact); those are the ones a
// bad extraction would most harm, so they ride the same gate.
//
// PURE + framework-independent (no AI / Supabase). Unit-tested exhaustively.
// ─────────────────────────────────────────────────────────────────────────────

import { groundField, parsePrice, type RawExtractedField } from '@/lib/importer/extract/coerce'
import type { HarvestedSource } from '@/lib/importer/intake'
import type { ProvenanceLedger } from '@/lib/importer/schema'
import { LISTING_KINDS, type ListingKind } from '@/lib/marketplace'
import { toAmenities, toPropertyType } from '@/lib/listings/housing'
import type {
  ClassifiedsDraft,
  ClassifiedsExtraction,
  HousingDraft,
  HousingExtraction,
  ListingCoercion,
  ListingDetail,
  ListingExtraction,
  ListingSeedKind,
  RawCitedField,
  RawListingDetail,
} from './types'

/** Max item-detail chips + per-part length kept on a coerced classifieds draft (guards a runaway model). */
const MAX_DETAILS = 20
const DETAIL_LABEL_MAX = 40
const DETAIL_VALUE_MAX = 160

/** Coerce the model's raw detail chips into clean, ordered {label, value} pairs: trim both parts, drop any
 *  row missing a label OR a value, bound the length + count. Order is preserved. PURE + total. */
export function coerceDetails(raw: RawListingDetail[] | undefined): ListingDetail[] {
  if (!Array.isArray(raw)) return []
  const out: ListingDetail[] = []
  for (const item of raw) {
    const label = (item?.label ?? '').trim().slice(0, DETAIL_LABEL_MAX)
    const value = (item?.value ?? '').trim().slice(0, DETAIL_VALUE_MAX)
    if (!label || !value) continue
    out.push({ label, value })
    if (out.length >= MAX_DETAILS) break
  }
  return out
}

const LISTING_KIND_SET = new Set<string>(LISTING_KINDS.map((k) => k.key))

/** Wrap the single pasted block as the ONE harvested source the grounding gate matches against.
 *  The seeder has no crawl; the paste IS the source of truth. PURE. */
function pasteSource(pastedText: string): HarvestedSource[] {
  return [{ id: 'paste', kind: 'paste', fetchedAt: '', text: pastedText ?? '' }]
}

/**
 * Coerce a raw model extraction into a ListingDraft + a first-pass ProvenanceLedger. Every scalar
 * field that carries a value gets a ledger entry at its path, grounded against the pasted block (an
 * un-cited 'fact' is downgraded to 'inferred'). `kind` is authoritative (the operator picked the
 * vertical); the raw shape is trusted only for values. PURE + total. Images are NOT extracted here
 * (they are operator uploads merged from the intake inputs at publish), so draft.images starts empty.
 */
export function coerceListingExtraction(
  raw: ListingExtraction,
  kind: ListingSeedKind,
  pastedText: string,
): ListingCoercion {
  const sources = pasteSource(pastedText)
  const ledger: ProvenanceLedger = {}

  /** Land a grounded ledger entry at `path` and return the trimmed value (or undefined when empty). */
  const put = (path: string, field: RawCitedField | undefined): string | undefined => {
    const value = (field?.value ?? '').trim()
    if (!field || !value) return undefined
    // `path` is a fixed literal below (never caller-derived), so there is no prototype-pollution risk.
    ledger[path] = [groundField(field as RawExtractedField, sources)]
    return value
  }

  if (kind === 'classifieds') {
    return { draft: coerceClassifieds(raw as ClassifiedsExtraction, put), ledger }
  }
  return { draft: coerceHousing(raw as HousingExtraction, put, sources, ledger), ledger }
}

type Put = (path: string, field: RawCitedField | undefined) => string | undefined

/** Classifieds -> market_listings draft. */
function coerceClassifieds(raw: ClassifiedsExtraction, put: Put): ClassifiedsDraft {
  return {
    kind: 'classifieds',
    title: put('title', raw.title) ?? '',
    description: put('description', raw.description) ?? null,
    listingKind: clampListingKind(raw.listingKind?.value),
    category: put('category', raw.category) ?? null,
    priceNote: put('priceNote', raw.priceNote) ?? null,
    details: coerceDetails(raw.details),
    // The seeder never publishes a scraped exact address: a seeded listing is always area-only.
    pickupPrecision: 'area',
    neighborhood: put('neighborhood', raw.neighborhood) ?? null,
    city: put('city', raw.city) ?? null,
    contact: put('contact', raw.contact) ?? null,
    images: [],
  }
}

/** Housing -> listings + housing_listings draft. Amenities are coerced through the controlled vocab
 *  (toAmenities) so a hallucinated slug can never reach the DB CHECK; each is grounded for provenance. */
function coerceHousing(
  raw: HousingExtraction,
  put: Put,
  sources: HarvestedSource[],
  ledger: ProvenanceLedger,
): HousingDraft {
  const amenityValues: string[] = []
  ;(raw.amenities ?? []).forEach((a, i) => {
    const value = (a?.value ?? '').trim()
    if (!value) return
    amenityValues.push(value)
    // Ground each amenity citation at a stable indexed path (literal-derived, no pollution risk).
    ledger[`amenities[${i}]`] = [groundField(a as RawExtractedField, sources)]
  })

  return {
    kind: 'housing',
    title: put('title', raw.title) ?? '',
    description: put('description', raw.description) ?? null,
    propertyType: toPropertyType(put('propertyType', raw.propertyType)),
    amenities: toAmenities(amenityValues),
    rentDollars: parseDollars(put('rentDollars', raw.rentDollars)),
    depositDollars: parseDollars(put('deposit', raw.deposit)),
    bedrooms: parseCount(put('bedrooms', raw.bedrooms)),
    bathrooms: parseCount(put('bathrooms', raw.bathrooms)),
    sqft: parseInteger(put('sqft', raw.sqft)),
    availableFrom: put('availableFrom', raw.availableFrom) ?? null,
    furnished: parseBool(put('furnished', raw.furnished)),
    petsOk: parseBool(put('petsOk', raw.petsOk)),
    utilitiesIncluded: parseBool(put('utilitiesIncluded', raw.utilitiesIncluded)),
    smokingOk: parseBool(put('smokingOk', raw.smokingOk)),
    cannabisOk: parseBool(put('cannabisOk', raw.cannabisOk)),
    neighborhood: put('neighborhood', raw.neighborhood) ?? null,
    city: put('city', raw.city) ?? null,
    contact: put('contact', raw.contact) ?? null,
    images: [],
  }
}

// ── PURE coercion helpers ─────────────────────────────────────────────────────────

/** Clamp the model's listing intent to a valid LISTING_KIND, defaulting to 'offer'. PURE. */
export function clampListingKind(raw: string | undefined): ListingKind {
  const v = (raw ?? '').trim().toLowerCase()
  return LISTING_KIND_SET.has(v) ? (v as ListingKind) : 'offer'
}

/** Parse a dollar amount ("$1,800", "1800/mo", "from 1800") to a major-unit number, or null. PURE. */
export function parseDollars(raw: string | undefined): number | null {
  if (!raw) return null
  return parsePrice(raw)
}

/** Parse a room count ("2", "1.5 bath") to a non-negative number, or null. PURE. */
export function parseCount(raw: string | undefined): number | null {
  if (!raw) return null
  const m = raw.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** Parse an integer count (sqft), or null. PURE. */
export function parseInteger(raw: string | undefined): number | null {
  const n = parseCount(raw)
  return n === null ? null : Math.round(n)
}

/** Parse a yes/no field ("yes", "true", "pets ok", "no pets") to a boolean, or null when ambiguous.
 *  Negatives win first (so "no pets" reads false even though it contains the noun). PURE. */
export function parseBool(raw: string | undefined): boolean | null {
  if (!raw) return null
  const v = raw.trim().toLowerCase()
  if (/\b(no|not|none|never|false|excluded|unfurnished)\b/.test(v) || /^(n|0)$/.test(v)) return false
  if (/\b(yes|ok|okay|allowed|included|furnished|available|true)\b/.test(v) || /^(y|1)$/.test(v)) return true
  return null
}
