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
import { AMENITIES } from '@/lib/listings/types'
import type { ListingDetail, ListingDraft, ListingSeedKind } from '@/lib/listing-seeder/types'

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
export type FieldInput = 'text' | 'textarea' | 'number' | 'bool' | 'select' | 'amenities' | 'details'

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
   *  boolean|null for bool, string[] for amenities, ListingDetail[] for details). */
  raw: string | number | boolean | string[] | ListingDetail[] | null
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

// ── The per-kind field specs, DERIVED FROM THE STUDIO MANIFESTS ─────────────────────
//
// These two arrays used to be hand-written here, beside a member form that described the same
// entity a second time. Both sibling seeders derive theirs from a manifest
// (app/(main)/admin/business-seeder/review-model.ts is one line: `buildFieldModel(BUSINESS_MANIFEST,
// …)`), and this one did not — partly because housing had no manifest to derive from. It has one
// now (lib/studio/entities/housing.ts, ADR-1151), so the field list comes from the manifests and the
// drift is structurally impossible rather than merely unlikely.
//
// WHY NOT `buildFieldModel` LIKE THE BUSINESS SEEDER. That helper returns the kernel's `FieldState`,
// which is the right answer when the board renders the kernel's own review shape. This board does
// not: it renders `ListingReviewField`, with a seeder-specific provenance model (an aggregate badge
// across every `amenities[i]` ledger key) and two editors the kernel has no notion of (`details`
// chips, and a free-text `contact` scraped from the paste). Rewriting the board to the kernel's
// shape is a bigger change than this row, and it is not what makes the two descriptions drift. What
// makes them drift is the FIELD LIST, so the field list is what now has one source.
//
// THE JOIN, stated explicitly because an implicit one is how this drifted the first time:
//   * A manifest field appears on the board when the seeder DRAFT carries its path. The seeder
//     extracts a subset of what a member can fill in by hand, and a row for a path the draft never
//     populates would be a permanently empty row that reads as a gap in the paste.
//   * SEEDER_ONLY fields are declared below with their reason. They are real board fields with no
//     manifest counterpart, not oversights.
//   * EXCLUDED paths are manifest fields the draft DOES carry that the board deliberately omits,
//     each with its reason.
// `listing-seeder/review-model.test.ts` asserts this join covers every draft key, so adding a field
// to either side without the other fails a test rather than silently producing a half-reviewed
// listing.

import { HOUSING_MANIFEST } from '@/lib/studio/entities/housing'
import { LISTING_MANIFEST } from '@/lib/studio/entities/listing'
import type { EntityManifest, FieldDef } from '@/lib/studio/kernel/manifest'

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

/** Kernel field kind -> the editor this board renders. `price` and `number` are the same control
 *  here because the draft holds DOLLARS as a plain number (the publish agent converts to cents).
 *  `date` is a text box because the draft keeps the date exactly as pasted and validates it at
 *  publish, so a date picker would silently discard an ambiguous paste the operator should see. */
const INPUT_FOR_KIND: Partial<Record<FieldDef['kind'], FieldInput>> = {
  text: 'text',
  longtext: 'textarea',
  select: 'select',
  multiselect: 'amenities',
  number: 'number',
  price: 'number',
  toggle: 'bool',
  date: 'text',
}

/** Manifest section -> board section. The board groups by what an operator VERIFIES against the
 *  paste (is this stated? is it inferred?), which is coarser than the eight sections a member fills
 *  in, so several manifest sections land in one board section. */
const SECTION_FOR: Record<string, ListingReviewSectionKey> = {
  identity: 'basics',
  details: 'basics',
  terms: 'price',
  space: 'details',
  features: 'details',
  rules: 'details',
  place: 'location',
}

/** Per-path overrides, each with a reason. Kept tiny on purpose: an override list that grows is the
 *  signal that the mapping above is wrong, not that this list needs another row. */
const SECTION_OVERRIDE: Record<string, ListingReviewSectionKey> = {
  // The manifest groups it with the lease terms, which is right for a member deciding what to
  // offer. An operator checking a paste reads it as one more spec beside the bedroom count.
  availableFrom: 'details',
}

/** Ledger keys that differ from the draft path, because the coercer wrote them that way. */
const LEDGER_KEY: Record<string, string> = { depositDollars: 'deposit' }

/** A manifest path spelled differently on the seeder draft. ONE entry, and it is a genuine
 *  difference rather than a typo: the draft calls it `listingKind` because `kind` is already taken
 *  by the draft's own discriminant ('classifieds' | 'housing'). */
const PATH_ALIAS: Record<string, string> = { kind: 'listingKind' }

/** Manifest paths the draft carries that the board deliberately does NOT review, with the reason. */
const EXCLUDED = new Set<string>([
  // Photos are reviewed in the board's own gallery (operator uploads, first-is-cover), not as a
  // text row. A row here would render "3 photos" beside an editor that cannot change them.
  'images',
])

/** Board fields with no manifest counterpart. Real fields, declared with why they are seeder-only. */
const SEEDER_ONLY: Record<'classifieds' | 'housing', readonly FieldSpec[]> = {
  classifieds: [
    // Ordered {label, value} chips extracted from the paste. A MEMBER writes these into their
    // description in their own words; only the seeder splits them out, so the manifest has no field.
    { path: 'details', label: 'Item details', section: 'details', input: 'details' },
    // How the original poster said to reach them, kept verbatim. A member listing never needs this:
    // the app already knows who they are and messages route through it.
    { path: 'contact', label: 'Contact', section: 'contact', input: 'text' },
  ],
  housing: [{ path: 'contact', label: 'Contact', section: 'contact', input: 'text' }],
}

/** Board labels that differ from the member-facing manifest label, because the audience differs: a
 *  member sees "Rent (per month)" on a form about their own home; an operator verifying a paste
 *  wants the unit stated. Absent === use the manifest label. */
const BOARD_LABEL: Record<string, string> = {
  description: 'Description',
  rentDollars: 'Rent (monthly, $)',
  depositDollars: 'Deposit ($)',
  petsOk: 'Pets OK',
  cannabisOk: 'Cannabis OK',
  listingKind: 'Listing kind',
}

/**
 * Turn a manifest into the board's field specs, keeping only what the seeder draft carries. PURE.
 *
 * `draftKeys` is what makes this a JOIN rather than a copy: the manifest is the vocabulary, the
 * draft is what the extractor can actually fill, and the board shows the intersection.
 */
function specsFrom(
  manifest: EntityManifest,
  draftKeys: ReadonlySet<string>,
  seederOnly: readonly FieldSpec[],
): readonly FieldSpec[] {
  const derived: FieldSpec[] = []
  for (const f of manifest.fields) {
    const path = PATH_ALIAS[f.path] ?? f.path
    if (EXCLUDED.has(path) || !draftKeys.has(path)) continue
    const input = INPUT_FOR_KIND[f.kind]
    // A manifest field whose kind this board cannot render is SKIPPED rather than defaulted to a
    // text box. A text editor bound to an images array or an address would write the wrong shape.
    if (!input) continue
    const section = SECTION_OVERRIDE[path] ?? SECTION_FOR[f.section]
    if (!section) continue
    derived.push({
      path,
      label: BOARD_LABEL[path] ?? f.label,
      section,
      input,
      ...(LEDGER_KEY[path] ? { ledgerKey: LEDGER_KEY[path] } : {}),
      ...(f.options ? { options: f.options.map((o) => ({ value: o.value, label: o.label })) } : {}),
    })
  }
  return [...derived, ...seederOnly]
}

/** The draft keys each kind actually carries (lib/listing-seeder/types.ts). Listed rather than
 *  inferred because a TYPE cannot be enumerated at runtime; the test asserts these match the
 *  interfaces field for field, so a drift here fails rather than quietly narrowing the board. */
export const CLASSIFIEDS_DRAFT_KEYS: ReadonlySet<string> = new Set([
  'title', 'description', 'listingKind', 'category', 'priceNote', 'details',
  'pickupPrecision', 'neighborhood', 'city', 'contact', 'images',
])

export const HOUSING_DRAFT_KEYS: ReadonlySet<string> = new Set([
  'title', 'description', 'propertyType', 'amenities', 'rentDollars', 'depositDollars',
  'bedrooms', 'bathrooms', 'sqft', 'availableFrom', 'furnished', 'petsOk',
  'utilitiesIncluded', 'smokingOk', 'cannabisOk', 'neighborhood', 'city', 'contact', 'images',
])

export const CLASSIFIEDS_SPECS = specsFrom(LISTING_MANIFEST, CLASSIFIEDS_DRAFT_KEYS, SEEDER_ONLY.classifieds)
export const HOUSING_SPECS = specsFrom(HOUSING_MANIFEST, HOUSING_DRAFT_KEYS, SEEDER_ONLY.housing)

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
  if (input === 'details') {
    const list = Array.isArray(raw) ? (raw as ListingDetail[]) : []
    return list.map((d) => `${d.label}: ${d.value}`).join(' · ')
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
  if (input === 'details') return Array.isArray(value) ? (value as ListingDetail[]) : []
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
  if (input === 'amenities' || input === 'details') return Array.isArray(raw) && raw.length > 0
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
