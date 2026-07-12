// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFIEDS & HOUSING SEEDER — the shared contracts (Phase 0). PURE +
// framework-independent (no AI / Supabase / React), so the extract, coerce, claim,
// persistence, and the later console/publish/claim-page agents all import the SAME
// shapes. Mirrors lib/importer/intake.ts (the business_intake analogue).
//
// The seeder lets an operator paste raw listing copy + photos; an AI extracts the
// structured fields (extract.ts, per-kind CITED tool); the PURE coercer (coerce.ts)
// grounds every field against the paste and coerces it to a ListingDraft; on publish
// (a later agent) the draft materializes as a listing OWNED BY the Frequency seed
// account (seed-owner.ts) carrying an events-style CLAIM TOKEN (claim.ts) so the
// original poster can sign up and take ownership.
// ─────────────────────────────────────────────────────────────────────────────

import type { ProvenanceLedger } from '@/lib/importer/schema'
import type { ListingKind } from '@/lib/marketplace'
import type { AmenitySlug, PropertyType } from '@/lib/listings/types'

// ── Kind ────────────────────────────────────────────────────────────────────────

/** The two seeder verticals: Classifieds (market_listings) and Housing (listings+housing_listings). */
export type ListingSeedKind = 'classifieds' | 'housing'

export const LISTING_SEED_KINDS: readonly ListingSeedKind[] = ['classifieds', 'housing']

// ── The raw (untrusted) model shape ──────────────────────────────────────────────

/** One field the model extracted, with the citation it claims. Every value is a string as the model
 *  emits it; the coercer parses/validates + grounds it. Mirrors importer RawExtractedField (minus the
 *  multi-source sourceUrl: a seeder run has exactly ONE source, the pasted block). */
export interface RawCitedField {
  value?: string
  /** The exact text from the paste that supports this value, copied verbatim. Required for a 'fact'. */
  snippet?: string
  /** The model's self-declared kind: fact (cited) | inferred (deduced) | generated (written). */
  kind?: string
  /** The model's 0..1 confidence. */
  confidence?: number
}

/** The untrusted Classifieds extraction the forced tool returns. Every field optional + cited. */
export interface ClassifiedsExtraction {
  kind: 'classifieds'
  title?: RawCitedField
  description?: RawCitedField
  /** The listing intent: offer | free | lend | request (clamped to LISTING_KINDS on coerce). */
  listingKind?: RawCitedField
  category?: RawCitedField
  priceNote?: RawCitedField
  neighborhood?: RawCitedField
  city?: RawCitedField
  contact?: RawCitedField
}

/** The untrusted Housing extraction the forced tool returns. Every field optional + cited. */
export interface HousingExtraction {
  kind: 'housing'
  title?: RawCitedField
  description?: RawCitedField
  propertyType?: RawCitedField
  /** Each amenity is its own cited field (grounded independently, coerced via toAmenities). */
  amenities?: RawCitedField[]
  rentDollars?: RawCitedField
  deposit?: RawCitedField
  bedrooms?: RawCitedField
  bathrooms?: RawCitedField
  sqft?: RawCitedField
  availableFrom?: RawCitedField
  furnished?: RawCitedField
  petsOk?: RawCitedField
  utilitiesIncluded?: RawCitedField
  smokingOk?: RawCitedField
  cannabisOk?: RawCitedField
  neighborhood?: RawCitedField
  city?: RawCitedField
  contact?: RawCitedField
}

/** What extractListing returns: the untrusted, cited model output for one paste (or null when AI is
 *  off / over budget / failed). Discriminated by `kind`. */
export type ListingExtraction = ClassifiedsExtraction | HousingExtraction

// ── The coerced draft (a discriminated union by kind) ─────────────────────────────

/** A Classifieds draft, coerced + grounded, ready for the review board + publish (createListing on
 *  market_listings). `images` are the operator uploads (merged from the intake inputs at publish). */
export interface ClassifiedsDraft {
  kind: 'classifieds'
  title: string
  description: string | null
  /** Clamped to LISTING_KINDS; defaults to 'offer'. */
  listingKind: ListingKind
  category: string | null
  priceNote: string | null
  neighborhood: string | null
  city: string | null
  contact: string | null
  images: string[]
}

/** A Housing draft, coerced + grounded, ready for the review board + publish (createListing on
 *  `listings` + upsertHousingDetail on `housing_listings`). Dollar amounts stay in DOLLARS here; the
 *  publish agent converts rent/deposit to CENTS (x100) for the housing_listings.*_cents columns. */
export interface HousingDraft {
  kind: 'housing'
  title: string
  description: string | null
  propertyType: PropertyType | null
  amenities: AmenitySlug[]
  rentDollars: number | null
  depositDollars: number | null
  bedrooms: number | null
  bathrooms: number | null
  sqft: number | null
  /** ISO-ish date string as pasted; validated downstream at publish. */
  availableFrom: string | null
  furnished: boolean | null
  petsOk: boolean | null
  utilitiesIncluded: boolean | null
  smokingOk: boolean | null
  cannabisOk: boolean | null
  neighborhood: string | null
  city: string | null
  contact: string | null
  images: string[]
}

export type ListingDraft = ClassifiedsDraft | HousingDraft

/** The output of the coercer: the draft plus the first-pass provenance ledger keyed by field path. */
export interface ListingCoercion {
  draft: ListingDraft
  ledger: ProvenanceLedger
}

// ── The intake row (mirrors the listing_intake DB row) ───────────────────────────

/** The seeder status machine, mirroring business_intake: intake -> researching -> review -> applied,
 *  with `failed` as a recoverable side-state. */
export type ListingIntakeStatus = 'intake' | 'researching' | 'review' | 'applied' | 'failed'

export const LISTING_INTAKE_STATUSES: readonly ListingIntakeStatus[] = [
  'intake',
  'researching',
  'review',
  'applied',
  'failed',
]

/** Optional operator nudges captured on the paste form (disambiguate the extract). */
export interface ListingHints {
  city?: string
  neighborhood?: string
  category?: string
}

/** The captured inputs for one seeder run (the `inputs` jsonb): the raw paste, operator photo uploads
 *  (public `library-media` URLs, first-is-primary), and optional hints. */
export interface ListingIntakeInputs {
  pastedText: string
  images?: string[]
  hints?: ListingHints
}

/** The typed view of a `listing_intake` row (the table is service-role only + not in database.types
 *  yet, so the persistence layer reaches it with untyped casts and returns THIS shape). */
export interface ListingIntake {
  id: string
  kind: ListingSeedKind
  inputs: ListingIntakeInputs
  /** The coerced ListingDraft once Extract completes; a partial record before then. */
  draft: ListingDraft | Record<string, unknown>
  ledger: ProvenanceLedger
  status: ListingIntakeStatus
  /** The published listing id (market_listings.id OR listings.id per kind). Null until applied. */
  appliedListingId: string | null
  createdBy: string
  error: string | null
  createdAt: string
  updatedAt: string
}
