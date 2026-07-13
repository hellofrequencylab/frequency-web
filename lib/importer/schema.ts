// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the canonical DRAFT schema (P0, docs/BUSINESS-IMPORTER.md
// §3, ADR-569). These are the TS shapes the later AI stages (P1+) produce and the
// materializer (lib/importer/materialize.ts) consumes. The whole point of P0: once a
// hand-authored BusinessProfile reliably seeds a full business, the AI stages just have
// to emit this JSON.
//
// PURE + framework-independent: no React / Next / Supabase imports, so this file is a
// contract, trivially importable from the materializer, the tests, and (later) the
// extract/verify/reframe stages. Every scalar carries a `->` note to its real Space
// storage location, mirroring the spec so composition stays a mechanical map.
//
// These shapes match the spec §3.4 (BusinessProfile) and §3.6 (ProvenanceLedger)
// EXACTLY so P1 can target them without a schema round. P0 does not populate the
// ledger (verification is P1); the types live here so the materializer and the
// commercial-fact gate (§4.3) can be wired against them without a later churn.
// ─────────────────────────────────────────────────────────────────────────────

/** The two Space designators (docs/NAMING.md — `business` and `nonprofit` are the only
 *  member-facing types; `root` is the hidden platform host and is never imported). */
export type BusinessType = 'business' | 'nonprofit'

/** How a service is priced (mirrors ServicePriceModel in lib/spaces/profile-data.ts, so
 *  an offering maps straight onto a SpaceOffering). */
export type OfferingPriceModel = 'fixed' | 'from' | 'free' | 'contact'

/** One offering (display-only in v1, §1 non-goals). Maps to a SpaceOffering row on
 *  `spaces.preferences.profileData.offerings[]`. */
export interface ProfileOffering {
  title: string
  blurb?: string
  /** Headline price in MAJOR units (dollars, never cents), matching SpaceOffering.price. */
  price?: number
  /** ISO 4217 code (default 'USD' on the Space side). */
  currency?: string
  priceModel?: OfferingPriceModel
  durationMinutes?: number
}

/** One team member. Free-text name + role (NOT a resolved member profile — see the
 *  materializer's team seam note). `avatarPath` is a site-media path when supplied. */
export interface ProfileTeamMember {
  name: string
  role?: string
  avatarPath?: string
}

/** One event to seed as an `events` row (space_id-stamped). */
export interface ProfileEvent {
  title: string
  /** ISO 8601 start instant. */
  startsAt?: string
  /** ISO 8601 end instant. */
  endsAt?: string
  location?: string
  blurb?: string
}

/** One testimonial / review. Author is free text (NOT a resolved member profile — see
 *  the materializer's reviews seam note; individual review rows need a real author
 *  profile, so P0 seeds the rating SUMMARY and holds per-review rows as a P1+ seam). */
export interface ProfileReview {
  author?: string
  text: string
  /** 1..5 stars. */
  rating?: number
}

/** One FAQ entry -> a `space_faqs` row. */
export interface ProfileFaq {
  q: string
  a: string
}

/** One social / business-presence link -> a SpaceSocialLink on profileData.socials. */
export interface ProfileSocial {
  platform: string
  url: string
}

/** Contact + hours block -> spaces.preferences.profileData (SpaceProfileData). */
export interface ProfileContact {
  address?: string
  phone?: string
  email?: string
  website?: string
  /** Free text, one line per day (matches SpaceProfileData.hours). */
  hours?: string
  socials?: ProfileSocial[]
}

/** An operator/owner star-rating summary -> profileData.rating / ratingCount. */
export interface ProfileRating {
  /** e.g. "4.8". */
  value?: string
  /** e.g. "126 reviews" or a bare count "126". */
  count?: string
}

/** Media paths already uploaded into `site-media` during Harvest (P1). For P0 a fixture
 *  can carry ready public URLs or paths; the materializer treats a full http(s) URL as
 *  ready and stores it as-is (no re-upload). */
export interface ProfileMedia {
  logoPath?: string
  heroPath?: string
  gallery?: string[]
}

/**
 * The extracted draft the Extract step (P1) fills and the materializer (P0) consumes.
 * Every scalar maps to a real Space storage location (the `->` notes), so composition is
 * a mechanical map. Matches docs/BUSINESS-IMPORTER.md §3.4 exactly.
 */
export interface BusinessProfile {
  // Identity -> spaces row
  name: string //                              -> spaces.name
  brandName?: string //                        -> spaces.brand_name
  slug?: string //                             -> spaces.slug (validated isSafeSlug; else derived)
  type: BusinessType //                        -> spaces.type
  tagline?: string //                          -> spaces.tagline
  category?: string //                         operator hint / discovery (not persisted as a column)
  accent?: string //                           -> spaces.brand_accent (token name or #hex, lib/spaces/accent.ts)

  // Story + about -> spaces.preferences.profileData / block content bags
  story?: string //                            reframed narrative -> 'story' block body
  about?: string //                            -> profileData.about / 'about' block

  // Demographic + positioning (Importer v2 #1, ADR-606). A short, plain summary of WHO this business
  // serves and HOW it is positioned, produced by the reframe stage's demographic analysis pass. It never
  // renders on the page; it is a private voice STEER fed into the reframe prompt so the Frequency-voice
  // copy speaks to the right audience (docs/CONTENT-VOICE.md). Absent ⇒ the reframe behaves exactly as
  // before (backwards-compatible). Not a commercial fact, so it is never gated / published.
  demographic?: string //                      voice steer only (not persisted as a Space column)

  // Contact + hours -> spaces.preferences.profileData (SpaceProfileData)
  contact?: ProfileContact

  // Reputation (verify-gated) -> profileData.rating / ratingCount, reviews
  rating?: ProfileRating
  reviews?: ProfileReview[]

  // Offerings (display-only in v1) -> profileData.offerings[] (SpaceOffering)
  offerings?: ProfileOffering[]

  // Team -> space_members (invite/seed rows) OR the team block's picked-member override
  team?: ProfileTeamMember[]

  // Events -> events table (space_id-stamped)
  events?: ProfileEvent[]

  // FAQ -> space_faqs
  faq?: ProfileFaq[]

  // Business-presence / bio links -> a `links` content block on the profile layout
  links?: ProfileSocial[]

  // Media -> site-media bucket paths (already uploaded during Harvest)
  media?: ProfileMedia

  // Availability (if booking) -> space_availability rows
  availability?: AvailabilityWindowInput[]

  // Layout intent -> EntityLayout the materializer writes to spaces.preferences.profileLayout
  layoutHint?: string[] //                     ordered block ids the composer prefers, e.g.
  //                                           ['photoHero','about','offerings','contact']
}

/** A weekly booking window, in the shape lib/spaces/booking.ts normalizeWindow accepts,
 *  so an offering studio can seed a bookable schedule. `weekday` 0 = Sunday..6 = Saturday;
 *  minutes are from local midnight in `timezone`. */
export interface AvailabilityWindowInput {
  weekday: number
  startMinute: number
  endMinute: number
  slotMinutes?: number
  timezone?: string
}

// ── Provenance ledger (docs §3.6) ────────────────────────────────────────────────────
// P0 does NOT populate the ledger (verification is the P1 job). The types live here so
// the materializer and the commercial-fact gate can be typed against them now, and so
// P1's verifier writes into a shape the materializer already understands.

/** fact = cited from a source; inferred = deduced; generated = written by AI. */
export type LedgerKind = 'fact' | 'inferred' | 'generated'

/** One provenance entry for a draft field path. */
export interface LedgerEntry {
  /** Where the claim came from (null/absent for 'generated'). */
  sourceUrl?: string
  /** The exact harvested text that supports it. */
  snippet?: string
  /** 0..1. */
  confidence: number
  kind: LedgerKind
  /** Set once the adversarial verifier or an operator confirms it. */
  verifiedBy?: 'auto' | 'human'
}

/** Record keyed by a draft field path (e.g. 'contact.phone') to its ledger entries. */
export type ProvenanceLedger = Record<string, LedgerEntry[]>

// ── Commercial-fact gate (docs §4.3) ─────────────────────────────────────────────────

/** The commercial-fact field paths that may NEVER auto-publish without a cited, verified
 *  ledger entry (docs §4.3). The materializer enforces this at Apply (not just the UI), so
 *  a UI bypass cannot leak an unverified price. P0 passes an EMPTY ledger, so with the
 *  default policy every commercial field is treated as verified for a hand-authored draft;
 *  P1 supplies a real ledger and the gate withholds unverified facts. */
export const COMMERCIAL_FACT_PATHS: readonly string[] = [
  'contact.address',
  'contact.phone',
  'contact.email',
  'contact.hours',
  'rating',
  'offerings[].price',
]

/**
 * Whether a commercial field at `path` is cleared to publish given its ledger entries.
 * A field is cleared when it has a `fact` entry that has been verified (`verifiedBy` set).
 * PURE + total. P0 passes NO ledger for a hand-authored draft, so callers opt into the
 * gate explicitly (see materialize.ts `verificationPolicy`).
 */
export function isCommercialFieldCleared(entries: LedgerEntry[] | undefined): boolean {
  if (!entries || entries.length === 0) return false
  return entries.some((e) => e.kind === 'fact' && !!e.verifiedBy)
}
