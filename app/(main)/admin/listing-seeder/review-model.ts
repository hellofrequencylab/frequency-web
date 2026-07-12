// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFIEDS & HOUSING SEEDER — the REVIEW MODEL (Wave 1). PURE +
// framework-independent (no React / Next / Supabase). Turns a persisted intake
// ({ draft: ListingDraft; ledger: ProvenanceLedger }) into the flat, field-by-field
// list the review board renders, KIND-DRIVEN by the draft's discriminant.
//
// For every field it surfaces: the current value (a display string + the raw value
// the editor binds to), its provenance BADGE from the ledger (fact / inferred /
// generated, or none when the field is hand-supplied), the cited snippet, and the
// editor type the board should render (text / textarea / number / bool / select /
// amenities). Mirrors the business seeder's review-model shape, minus the commercial
// gate (a seeded listing is owned by the Frequency seed account until claimed, so
// there is no auto-publish withholding to model here).
// ─────────────────────────────────────────────────────────────────────────────

import type { LedgerEntry, ProvenanceLedger } from '@/lib/importer/schema'
import { LISTING_KINDS } from '@/lib/marketplace'
import { PROPERTY_TYPES, AMENITIES } from '@/lib/listings/types'
import type { ListingDraft, ListingSeedKind } from '@/lib/listing-seeder/types'

/** The provenance badge painted on a row: the ledger entry's kind, or null when a field
 *  has no ledger entry (hand-supplied / empty). */
export type ProvenanceKind = LedgerEntry['kind']

/** The status-legend glyph for each provenance kind (docs/PRESENTATION.md legend). */
export const PROVENANCE_GLYPH: Record<ProvenanceKind, string> = {
  fact: '✅',
  inferred: '⚠️',
  generated: '✨',
}

/** The plain label for each provenance kind, for the row chip. */
export const PROVENANCE_LABEL: Record<ProvenanceKind, string> = {
  fact: 'From the paste',
  inferred: 'Inferred',
  generated: 'AI copy',
}

/** The editor a field renders in the board. */
export type FieldInput = 'text' | 'textarea' | 'number' | 'bool' | 'select' | 'amenities'

/** The board sections (order = render order). */
export type ListingReviewSectionKey = 'basics' | 'details' | 'price' | 'location' | 'contact'

/** One reviewable field, flattened for the board. */
export interface ListingReviewField {
  /** The draft key the editor patches (e.g. 'title', 'rentDollars', 'petsOk'). */
  path: string
  /** A human label for the row. */
  label: string
  /** Which editor to render. */
  input: FieldInput
  /** For `select`, the allowed options. */
  options?: { value: string; label: string }[]
  /** The value rendered in the read view (empty string when unset). */
  display: string
  /** The raw value the editor binds to (string for text/select, number|null for number,
   *  boolean|null for bool, string[] for amenities). */
  raw: string | number | boolean | string[] | null
  /** The provenance badge from the ledger, or null when the field has no entry. */
  provenanceKind: ProvenanceKind | null
  /** The cited snippet from the paste, if the ledger recorded one. */
  snippet: string | null
  /** The 0..1 confidence from the ledger, if any. */
  confidence: number | null
}

export interface ListingReviewSection {
  key: ListingReviewSectionKey
  title: string
  desc: string
  fields: ListingReviewField[]
}

export interface ListingReviewModel {
  kind: ListingSeedKind
  /** A best-effort display title for the board header. */
  title: string
  sections: ListingReviewSection[]
  /** Roll-up counts across the scalar fields, for the board header legend. */
  summary: {
    total: number
    facts: number
    inferred: number
    generated: number
    /** Fields with no value set yet. */
    empty: number
  }
}

// ── The per-kind field specs (config, not code) ─────────────────────────────────────

interface FieldSpec {
  path: string
  label: string
  section: ListingReviewSectionKey
  input: FieldInput
  /** Where provenance lives in the ledger, when it differs from `path`
   *  (deposit is coerced under the ledger key 'deposit', not 'depositDollars'). */
  ledgerKey?: string
  options?: { value: string; label: string }[]
}

const LISTING_KIND_OPTIONS = LISTING_KINDS.map((k) => ({ value: k.key, label: k.label }))
const PROPERTY_TYPE_OPTIONS = PROPERTY_TYPES.map((p) => ({ value: p.slug, label: p.label }))

const CLASSIFIEDS_SPECS: readonly FieldSpec[] = [
  { path: 'title', label: 'Title', section: 'basics', input: 'text' },
  { path: 'description', label: 'Description', section: 'basics', input: 'textarea' },
  { path: 'listingKind', label: 'Listing kind', section: 'basics', input: 'select', options: LISTING_KIND_OPTIONS },
  { path: 'category', label: 'Category', section: 'basics', input: 'text' },
  { path: 'priceNote', label: 'Price note', section: 'price', input: 'text' },
  { path: 'neighborhood', label: 'Neighborhood', section: 'location', input: 'text' },
  { path: 'city', label: 'City', section: 'location', input: 'text' },
  { path: 'contact', label: 'Contact', section: 'contact', input: 'text' },
]

const HOUSING_SPECS: readonly FieldSpec[] = [
  { path: 'title', label: 'Title', section: 'basics', input: 'text' },
  { path: 'description', label: 'Description', section: 'basics', input: 'textarea' },
  { path: 'propertyType', label: 'Property type', section: 'basics', input: 'select', options: PROPERTY_TYPE_OPTIONS },
  { path: 'bedrooms', label: 'Bedrooms', section: 'details', input: 'number' },
  { path: 'bathrooms', label: 'Bathrooms', section: 'details', input: 'number' },
  { path: 'sqft', label: 'Square feet', section: 'details', input: 'number' },
  { path: 'availableFrom', label: 'Available from', section: 'details', input: 'text' },
  { path: 'furnished', label: 'Furnished', section: 'details', input: 'bool' },
  { path: 'petsOk', label: 'Pets OK', section: 'details', input: 'bool' },
  { path: 'utilitiesIncluded', label: 'Utilities included', section: 'details', input: 'bool' },
  { path: 'smokingOk', label: 'Smoking OK', section: 'details', input: 'bool' },
  { path: 'cannabisOk', label: 'Cannabis OK', section: 'details', input: 'bool' },
  { path: 'amenities', label: 'Amenities', section: 'details', input: 'amenities' },
  { path: 'rentDollars', label: 'Rent (monthly, $)', section: 'price', input: 'number' },
  { path: 'depositDollars', label: 'Deposit ($)', section: 'price', input: 'number', ledgerKey: 'deposit' },
  { path: 'neighborhood', label: 'Neighborhood', section: 'location', input: 'text' },
  { path: 'city', label: 'City', section: 'location', input: 'text' },
  { path: 'contact', label: 'Contact', section: 'contact', input: 'text' },
]

const SECTION_META: Record<ListingReviewSectionKey, { title: string; desc: string }> = {
  basics: { title: 'Basics', desc: 'What the listing is. The title and description carry it.' },
  details: { title: 'Details', desc: 'The specifics a seeker filters on. Leave a field unset when the paste does not say.' },
  price: { title: 'Price', desc: 'What it costs. Only what the paste actually states.' },
  location: { title: 'Location', desc: 'Where it is. Neighborhood and city.' },
  contact: { title: 'Contact', desc: 'How to reach the poster, exactly as they wrote it.' },
}

const SECTION_ORDER: ListingReviewSectionKey[] = ['basics', 'details', 'price', 'location', 'contact']

const AMENITY_LABEL = new Map(AMENITIES.map((a) => [a.slug, a.label]))

// ── Value formatting ────────────────────────────────────────────────────────────────

/** The read-view string for a raw draft value. */
function displayOf(input: FieldInput, raw: unknown): string {
  if (input === 'bool') {
    if (raw === true) return 'Yes'
    if (raw === false) return 'No'
    return ''
  }
  if (input === 'amenities') {
    const list = Array.isArray(raw) ? raw : []
    return list.map((s) => AMENITY_LABEL.get(s as never) ?? String(s)).join(', ')
  }
  if (raw === null || raw === undefined) return ''
  if (input === 'select') {
    return String(raw)
  }
  return String(raw)
}

/** The raw value the editor binds to, normalized per input type. */
function rawOf(input: FieldInput, value: unknown): ListingReviewField['raw'] {
  if (input === 'bool') return typeof value === 'boolean' ? value : null
  if (input === 'number') return typeof value === 'number' && Number.isFinite(value) ? value : null
  if (input === 'amenities') return Array.isArray(value) ? (value as string[]) : []
  if (value === null || value === undefined) return ''
  return String(value)
}

/** The strongest ledger entry for a path (verified facts first, then confidence). */
function strongestEntry(entries: LedgerEntry[] | undefined): LedgerEntry | undefined {
  if (!entries || entries.length === 0) return undefined
  return [...entries].sort((a, b) => {
    const av = a.kind === 'fact' ? 1 : 0
    const bv = b.kind === 'fact' ? 1 : 0
    if (av !== bv) return bv - av
    return (b.confidence ?? 0) - (a.confidence ?? 0)
  })[0]
}

/** For amenities, the aggregate provenance across every `amenities[i]` entry: fact wins,
 *  else inferred, else generated, else null. */
function amenityProvenance(ledger: ProvenanceLedger): LedgerEntry | undefined {
  const entries: LedgerEntry[] = []
  for (const key of Object.keys(ledger)) {
    if (key.startsWith('amenities[')) entries.push(...(ledger[key] ?? []))
  }
  return strongestEntry(entries)
}

// ── Whether a raw value counts as "set" (for the empty tally) ──────────────────────

function isSet(input: FieldInput, raw: ListingReviewField['raw']): boolean {
  if (input === 'bool') return raw !== null
  if (input === 'number') return raw !== null
  if (input === 'amenities') return Array.isArray(raw) && raw.length > 0
  return typeof raw === 'string' && raw.trim().length > 0
}

// ── The model builder ─────────────────────────────────────────────────────────────

/**
 * Build the review model for one intake from its draft + ledger. PURE. The draft's `kind`
 * selects the field set; unknown draft keys are ignored (only the KNOWN per-kind fields are
 * reviewable). Empty fields still surface so the operator sees what the paste did not say.
 */
export function buildListingReviewModel(draft: ListingDraft, ledger: ProvenanceLedger): ListingReviewModel {
  const kind = draft.kind
  const specs = kind === 'classifieds' ? CLASSIFIEDS_SPECS : HOUSING_SPECS
  const bag = draft as unknown as Record<string, unknown>

  const byKey = new Map<ListingReviewSectionKey, ListingReviewField[]>()
  let facts = 0
  let inferred = 0
  let generated = 0
  let empty = 0

  for (const spec of specs) {
    const value = bag[spec.path]
    const raw = rawOf(spec.input, value)
    const display = displayOf(spec.input, value)

    const entry =
      spec.input === 'amenities'
        ? amenityProvenance(ledger)
        : strongestEntry(ledger[spec.ledgerKey ?? spec.path])

    const provenanceKind = entry?.kind ?? null
    if (provenanceKind === 'fact') facts++
    else if (provenanceKind === 'inferred') inferred++
    else if (provenanceKind === 'generated') generated++
    if (!isSet(spec.input, raw)) empty++

    const field: ListingReviewField = {
      path: spec.path,
      label: spec.label,
      input: spec.input,
      display,
      raw,
      provenanceKind,
      snippet: entry?.snippet ?? null,
      confidence: entry ? (entry.confidence ?? 0) : null,
      ...(spec.options ? { options: spec.options } : {}),
    }
    const list = byKey.get(spec.section) ?? []
    list.push(field)
    byKey.set(spec.section, list)
  }

  const sections: ListingReviewSection[] = SECTION_ORDER.map((key) => ({
    key,
    title: SECTION_META[key].title,
    desc: SECTION_META[key].desc,
    fields: byKey.get(key) ?? [],
  })).filter((s) => s.fields.length > 0)

  const title = (typeof bag.title === 'string' && bag.title.trim()) || 'Untitled listing'

  return {
    kind,
    title,
    sections,
    summary: { total: specs.length, facts, inferred, generated, empty },
  }
}

// ── Draft display helpers reused by the console list ───────────────────────────────

/** A best-effort display title for an intake's draft (title -> 'Untitled listing'). PURE. */
export function listingDraftTitle(draft: { title?: unknown } | null | undefined): string {
  const t = draft && typeof draft.title === 'string' ? draft.title.trim() : ''
  return t || 'Untitled listing'
}
