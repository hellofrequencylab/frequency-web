// The Spotlight page is PUBLIC (anyone with the link, including signed-out and
// non-members, can view a published one). Anonymous visitors get ZERO row-level
// security on `profiles`, so this route treats RLS as absent and is the single
// authority on what may cross to the page: an EXPLICIT column allowlist, used AS
// the `.select()` argument (never `select('*')`, never a row spread). A column not
// named here cannot reach the page. The test in privacy.test.ts reads this string
// and fails if any contact/geo/auth/billing column ever appears in it.

/** The ONLY columns a public Spotlight page may read. Safe, member-curated, or
 *  gamification stats the member chose to display — never contact or location. */
export const SPOTLIGHT_COLUMNS = [
  'id',
  'handle',
  'display_name',
  'avatar_url',
  'header_image_url',
  'bio',
  'website',
  'community_role',
  'membership_tier',
  'created_at',
  'current_streak',
  'lifetime_gems',
  'profile_theme',
  'is_active',
  'is_system',
  // region LABEL only (the join exposes the name; no coordinates ever)
  'nexus_regions!nexus_region_id ( name )',
] as const

/** The literal `.select()` argument built from the allowlist. */
export const SPOTLIGHT_SELECT = SPOTLIGHT_COLUMNS.join(', ')

/** Columns that must NEVER appear in the allowlist (asserted by the test). The page
 *  reads `meta` nowhere — only derived booleans cross the server boundary. */
export const SPOTLIGHT_FORBIDDEN = [
  'phone',
  'email',
  'home_lat',
  'home_lng',
  'live_lat',
  'live_lng',
  'latitude',
  'longitude',
  'auth_user_id',
  'stripe',
  'vcard',
  'meta',
] as const

/** The typed shape of a row read through SPOTLIGHT_SELECT. */
export interface SpotlightRow {
  id: string
  handle: string
  display_name: string | null
  avatar_url: string | null
  header_image_url: string | null
  bio: string | null
  website: string | null
  community_role: string | null
  membership_tier: string | null
  created_at: string | null
  current_streak: number | null
  lifetime_gems: number | null
  profile_theme: string | null
  is_active: boolean | null
  is_system: boolean | null
  nexus_regions: { name: string | null } | null
}
