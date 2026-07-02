// ─────────────────────────────────────────────────────────────────────────────
// CENTRAL SPACE PROFILE DATA — the ONE source of truth for a Space's business info
// (owner directive, 2026-07: "all page content is dynamic; change the business
// address and it changes everywhere, no matter how it's displayed").
//
// Business + editorial facts live ONCE on `spaces.preferences.profileData`, not
// copied into each block's Puck props. Every block READS this off the shared
// `metadata.space.profile` seam (lib/spaces/content-data.ts injects it, the same
// way the live blocks read counts/events), so the operator edits the address (or
// hours, or story) in ONE Business Info form and every surface that shows it —
// the Contact card, the Business strip, a Spotlight — updates at once.
//
// BACKWARD COMPATIBLE: every field is optional and fail-safe. A block still
// accepts its own inline prop and falls back to it when the central field is
// empty (mergeField), so nothing regresses before the operator fills the form.
//
// PURE + total: no server/Next imports, tolerant of malformed blobs.
// ─────────────────────────────────────────────────────────────────────────────

/** One social / business-presence link (branded chip). `platform` keys the icon + label. */
export interface SpaceSocialLink {
  platform: string
  url: string
}

/** The central, single-source Space profile data. All optional + fail-safe. Business facts first,
 *  then the editorial story. Offerings / callout / section copy join here in a later phase. */
export interface SpaceProfileData {
  /** Street address (also powers the map link on the Contact card). */
  address?: string
  /** Opening hours, free text (one per line). */
  hours?: string
  /** Public phone number. */
  phone?: string
  /** Public contact email. */
  email?: string
  /** Primary website URL. */
  website?: string
  /** Social / business-presence links (LinkedIn, Facebook, Instagram, Yelp, Google, ...). */
  socials?: SpaceSocialLink[]
  /** Operator-entered star rating, e.g. "4.8" (Yelp/Google style). Never invented. */
  rating?: string
  /** The rating's review count label, e.g. "126 reviews". */
  ratingCount?: string
  /** The About / story body (one source for the About card + anywhere the story shows). */
  about?: string
}

const KNOWN_PLATFORMS = new Set([
  'website',
  'linkedin',
  'facebook',
  'instagram',
  'x',
  'youtube',
  'tiktok',
  'yelp',
  'google',
])

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined
}

/** Read the central profile data off a preferences blob. FAIL-SAFE: an unknown / malformed shape
 *  yields an empty object, so a caller renders with nothing rather than throwing. Pure + total. */
export function readProfileData(preferences: unknown): SpaceProfileData {
  const prefs = preferences && typeof preferences === 'object' ? (preferences as Record<string, unknown>) : {}
  const raw = prefs.profileData
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const p = raw as Record<string, unknown>
  const socialsRaw = Array.isArray(p.socials) ? (p.socials as unknown[]) : []
  const socials: SpaceSocialLink[] = socialsRaw
    .map((s) => {
      const row = s && typeof s === 'object' ? (s as Record<string, unknown>) : {}
      const platform = str(row.platform)?.toLowerCase()
      const url = str(row.url)
      return platform && url && KNOWN_PLATFORMS.has(platform) ? { platform, url } : null
    })
    .filter((s): s is SpaceSocialLink => s !== null)
  const out: SpaceProfileData = {}
  const address = str(p.address)
  const hours = str(p.hours)
  const phone = str(p.phone)
  const email = str(p.email)
  const website = str(p.website)
  const rating = str(p.rating)
  const ratingCount = str(p.ratingCount)
  const about = str(p.about)
  if (address) out.address = address
  if (hours) out.hours = hours
  if (phone) out.phone = phone
  if (email) out.email = email
  if (website) out.website = website
  if (socials.length > 0) out.socials = socials
  if (rating) out.rating = rating
  if (ratingCount) out.ratingCount = ratingCount
  if (about) out.about = about
  return out
}

/** The fields a Business Info form can submit (the writable central data). Same shape as the read
 *  model minus derivations. A blank string clears the field. */
export type ProfileDataPatch = SpaceProfileData

/** Immutably merge a patch into the preferences' profileData, dropping empties so the stored blob
 *  never accumulates blank keys. Pure: returns a NEW preferences object, input untouched. Unknown
 *  patch keys are ignored (only the known fields survive the readProfileData round-trip). */
export function withProfileData(preferences: unknown, patch: ProfileDataPatch): Record<string, unknown> {
  const prefs = preferences && typeof preferences === 'object' && !Array.isArray(preferences)
    ? { ...(preferences as Record<string, unknown>) }
    : {}
  // Merge over the current data, then normalize through readProfileData so only valid, non-empty
  // fields persist (a cleared field drops out entirely).
  const merged = { ...readProfileData(prefs), ...patch }
  const normalized = readProfileData({ profileData: merged })
  if (Object.keys(normalized).length === 0) {
    delete prefs.profileData
  } else {
    prefs.profileData = normalized
  }
  return prefs
}

/** Pick the effective value for a field: the CENTRAL profile value wins (single source of truth — edit
 *  once, changes everywhere), falling back to the block's own inline prop ONLY when the central field
 *  is empty (a legacy stored doc whose operator has not filled the Business Info form yet). Once the
 *  central field is set it overrides every block, which is the whole point of the single source. */
export function mergeField(blockProp: string | undefined, central: string | undefined): string | undefined {
  const c = central?.trim()
  if (c) return c
  const p = blockProp?.trim()
  return p ? p : undefined
}
