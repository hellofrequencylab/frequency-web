// ── PROFILE COMPLETENESS / SEARCH-READINESS SCORER (PURE) ──────────────────────────────────────────
// A small, TOTAL scorer the /manage console surfaces to an operator so they can see, at a glance, how
// "findable" their Space is: which of the SEO / answer-engine-relevant fields are filled and which
// still need attention. The same fields drive the profile's structured data (spaceSchema in
// lib/jsonld.ts) and its rich-result eligibility — a logo, a description (tagline/about), listed
// offerings, and at least one review each unlock a signal an answer engine reads. This scorer never
// invents anything: it only reflects what the operator has actually filled in.
//
// PURE + total: no server / Next imports, tolerant of missing inputs, so it is trivially unit-tested
// and can run in any context (the console reads the space + profileData + reviews and passes the
// resolved primitives in). It returns a percentage (0-100) plus an ordered checklist of every field
// with its done/missing state, so the console can both show the score AND point the operator at the
// exact next thing to add.

/** One checked item on the readiness checklist. `key` is a stable id (for React keys / analytics),
 *  `label` is the operator-facing name of the field, `hint` is the plain "why it matters / where to
 *  add it" nudge, and `done` is whether it is filled. */
export interface CompletenessItem {
  key: string
  label: string
  hint: string
  done: boolean
}

/** The resolved completeness report: the score (0-100, whole number), the raw done/total counts, and
 *  the full ordered checklist (done + missing), so a caller can render a meter + the "what's missing"
 *  nudges. `missing` is the checklist filtered to the not-yet-done items, ordered as the checklist. */
export interface CompletenessReport {
  /** 0-100, rounded to a whole percent. 100 when every tracked field is filled. */
  score: number
  /** How many tracked fields are filled. */
  done: number
  /** How many fields are tracked in total. */
  total: number
  /** Every tracked field with its done/missing state, in a stable display order. */
  items: CompletenessItem[]
  /** Just the not-yet-done items (a subset of `items`, same order), for a compact "add these" list. */
  missing: CompletenessItem[]
}

/** The raw, already-resolved inputs the scorer reads. The console resolves these off the Space + its
 *  central profileData + the reviews summary and passes the primitives in, so the scorer stays pure
 *  (no store reads). Every field is optional + fail-safe: a missing input simply counts as not-done. */
export interface CompletenessInput {
  /** The display brand name (spaces.brand_name, else the plain Space name). A blank/whitespace value
   *  counts as not set. */
  brandName?: string | null
  /** The one-line tagline (spaces.tagline) — the profile's schema `description`. */
  tagline?: string | null
  /** The longer About / story intro (spaces.about column, and/or profileData.about). */
  about?: string | null
  /** The brand logo URL (spaces.brand_logo_url) — the schema's primary image. */
  logoUrl?: string | null
  /** The uploaded cover banner (spaces.cover_image_url). */
  coverUrl?: string | null
  /** How many public offerings / services the operator has listed (profileData.offerings). */
  offeringsCount?: number | null
  /** How many visible member reviews the Space has (drives the schema AggregateRating). */
  reviewCount?: number | null
  /** How many social / business-presence links the operator has added (profileData.socials) — the
   *  schema `sameAs` edges that help an answer engine resolve the entity. */
  socialCount?: number | null
}

/** True when a value is a non-empty, non-whitespace string. */
function filled(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.trim().length > 0
}

/** True when a count input is a finite number ≥ the threshold (default 1). A missing/NaN count is not
 *  met. */
function hasAtLeast(v: number | null | undefined, min = 1): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v >= min
}

/**
 * Score a Space's profile completeness / search-readiness from its already-resolved fields. PURE +
 * total. Returns a 0-100 percent (every tracked field weighted equally) plus the full checklist and
 * the missing subset, so the console can render a meter AND the exact next steps. Order of `items` is
 * the display order (identity first, then the SEO enrichers).
 */
export function scoreProfileCompleteness(input: CompletenessInput): CompletenessReport {
  const items: CompletenessItem[] = [
    {
      key: 'brandName',
      label: 'Brand name',
      hint: 'The name people search for. This is your profile’s headline.',
      done: filled(input.brandName),
    },
    {
      key: 'tagline',
      label: 'Tagline',
      hint: 'One line that says what you do. It becomes your search description.',
      done: filled(input.tagline),
    },
    {
      key: 'about',
      label: 'About',
      hint: 'A short story so visitors (and answer engines) know who you are.',
      done: filled(input.about),
    },
    {
      key: 'logo',
      label: 'Logo',
      hint: 'Your brand mark. It’s the main image in search results.',
      done: filled(input.logoUrl),
    },
    {
      key: 'cover',
      label: 'Cover photo',
      hint: 'A banner that makes the profile read as a real, staffed page.',
      done: filled(input.coverUrl),
    },
    {
      key: 'offering',
      label: 'At least one offering',
      hint: 'List what you offer so it can show up and be booked.',
      done: hasAtLeast(input.offeringsCount),
    },
    {
      key: 'review',
      label: 'At least one review',
      hint: 'Reviews unlock star ratings in search results.',
      done: hasAtLeast(input.reviewCount),
    },
    {
      key: 'socials',
      label: 'A social or website link',
      hint: 'Links tie this profile to your other pages so search can trust it.',
      done: hasAtLeast(input.socialCount),
    },
  ]

  const total = items.length
  const done = items.filter((i) => i.done).length
  const score = total === 0 ? 0 : Math.round((done / total) * 100)
  const missing = items.filter((i) => !i.done)

  return { score, done, total, items, missing }
}
