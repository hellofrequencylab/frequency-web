'use server'

// CLIENT-CALLABLE READ GETTER for the personal "You" inline surfaces of the standardized admin rail
// (ADR-514 Phase D; ADR-515 Phase 2). The bar renders a signed-in viewer's OWN Profile / Spotlight / Layout
// INLINE, but those editors were built as SERVER-fed /settings/* pages. This getter lets the client bar's
// thin wrapper modules self-fetch exactly the prop bundle the /settings/profile page assembles, mirroring
// the Space rail-getters (app/(main)/spaces/[slug]/manage/rail-getters.ts):
//   • it RE-GATES server-side on the AUTHED viewer (the viewer edits their own account) and returns NULL
//     when signed out — so the wrapper renders nothing (fail-safe: a flattened bar never weakens a gate);
//   • it returns only SERIALIZABLE data (plain values across the RSC boundary; no React, no Icons);
//   • it is READ-ONLY — no write action changes. The form's own action (updateProfile / setMySpotlight*)
//     already re-checks auth server-side, so this is convenience over an unchanged authority.
//
// ADR-515 Phase 2 moved Appearance, Notifications, and Connections and location OUT of the sidebar into the
// bottom bank (they link to their /settings/* page via lib/admin/entity-surface-hrefs.ts), so their inline
// wrappers + the getNotificationsRailData / getConnectionsRailData getters were retired. Only the Profile
// bundle remains — it feeds the inline Profile form, the condensed Spotlight section (the spotlight flags),
// and the Layout link (the handle).

import { createClient } from '@/lib/supabase/server'
import { getProfileCapabilities } from '@/lib/core/load-capabilities'
import {
  readSpotlightEnabled,
  readSpotlightPublished,
  readSpotlightThemeRaw,
  readSpotlightBackgroundRaw,
} from '@/lib/profile/spotlight-flags'
import { validateSpotlightTheme, type SpotlightTheme } from '@/lib/spotlight/theme'
import { validateSpotlightBackground } from '@/lib/spotlight/blocks/validate'
import type { SpotlightBackground } from '@/lib/spotlight/blocks/schema'
import { getTopFriendsForOwner, getAcceptedFriendsForPicker } from '@/lib/spotlight/top-friends'
import type { TopFriend } from '@/lib/spotlight/top-friends.types'
import { computeCompleteness } from '@/lib/profile/completeness'
import { deriveTier, ENTITLEMENT_LABEL } from '@/lib/core/entitlement'
import type { EntitlementTier } from '@/lib/core/entitlement'
import { readMemberGridLayout } from '@/lib/entity-blocks/member-grid-meta'
import { resolveRows, type RowDef } from '@/lib/entity-blocks/layout'

// ── Profile (account.profile / account.spotlight / account.layout) ─────────────────────────────────────
// The ProfileForm prop bundle the /settings/profile page assembles (profile/page.tsx). Re-gated on the
// authed user; the form's own updateProfile re-checks auth + ownership, so this is UX convenience.

interface ProfileRailData {
  userId: string
  initial: {
    displayName: string
    handle: string
    bio: string
    avatarUrl: string
    headerImageUrl: string
    email: string
    phone: string
    city: string
    website: string
    spotlightEnabled: boolean
    spotlightPublished: boolean
    canEnableSpotlight: boolean
    profileTheme: string | null
  }
}

/** The Profile editor's data, or null when signed out / the profile is missing (fail-safe → the wrapper
 *  renders nothing). Mirrors profile/page.tsx's fetch (the core ProfileForm bundle only — the QR card,
 *  onboarding welcome, and location card stay on the full page). */
export async function getProfileRailData(): Promise<ProfileRailData | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, handle, bio, avatar_url, phone, city, website, meta, profile_theme')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) return null

  const spotlightEnabled = readSpotlightEnabled((profile as { meta?: unknown }).meta)
  const spotlightPublished = readSpotlightPublished((profile as { meta?: unknown }).meta)
  const canEnableSpotlight = (await getProfileCapabilities(profile.id as string)).has('spotlight.enable')

  // header_image_url isn't in the generated types yet (new column) — read via cast, like the page.
  const { data: hdr } = await supabase
    .from('profiles')
    .select('header_image_url')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const headerImageUrl = (hdr as { header_image_url?: string | null } | null)?.header_image_url ?? ''

  return {
    userId: user.id,
    initial: {
      displayName: profile.display_name ?? '',
      handle: profile.handle ?? '',
      bio: profile.bio ?? '',
      avatarUrl: profile.avatar_url ?? '',
      headerImageUrl,
      email: user.email ?? '',
      phone: profile.phone ?? '',
      city: profile.city ?? '',
      website: profile.website ?? '',
      spotlightEnabled,
      spotlightPublished,
      canEnableSpotlight,
      profileTheme: (profile as { profile_theme?: string | null }).profile_theme ?? null,
    },
  }
}

// ── Profile completeness for the rail's relevance ranking (ADR-516 Phase E) ────────────────────────────
// The rail floats an incomplete "You" section to the top and boosts its search results. That needs ONE
// existing signal — the authed viewer's profile completeness — surfaced cheaply. Reuses getProfileRailData
// + the pure computeCompleteness helper (no new query, no new instrumentation) and RE-GATES on the authed
// viewer, returning null when signed out (fail-safe → the rail keeps its default order). READ-ONLY.

export interface ProfileCompletenessRail {
  /** Profile completeness 0..100 (pure, computed from the profile bundle + the Spotlight flag). */
  percent: number
}

/** The authed viewer's profile completeness for the rail relevance ranking, or null when signed out / the
 *  profile is missing (fail-safe). */
export async function getProfileCompletenessRail(): Promise<ProfileCompletenessRail | null> {
  const profile = await getProfileRailData()
  if (!profile) return null
  const i = profile.initial
  const { percent } = computeCompleteness({
    displayName: i.displayName,
    handle: i.handle,
    bio: i.bio,
    avatarUrl: i.avatarUrl,
    headerImageUrl: i.headerImageUrl,
    city: i.city,
    website: i.website,
    spotlightEnabled: i.spotlightEnabled,
  })
  return { percent }
}

// ── The member Hub (ADR-516 Phase B) ─────────────────────────────────────────────────────────────────
// The stats + nudge bundle the settings/content Hub rail shows (components/layout/admin-bar/hub-rail.tsx),
// sourced ENTIRELY from existing signals: the profile bundle above (completeness + Spotlight state), the
// profile's own lifetime Zaps / streak / plan row, and a cheap accepted-connections count. RE-GATES on the
// authed viewer and returns NULL when signed out (fail-safe → the Hub renders nothing). READ-ONLY.

export interface MemberHubData {
  handle: string | null
  /** Profile completeness 0..100 (pure, no query — computed from the profile bundle + Spotlight flag). */
  completeness: number
  /** The single biggest gap's nudge line, or null at 100% complete. On-canon, ready to render verbatim. */
  nudge: string | null
  /** Spotlight state for the stat tile. */
  spotlight: 'live' | 'draft' | 'off'
  /** Lifetime Zaps ever earned (proper noun in copy). */
  zaps: number
  /** Current day streak. */
  streak: number
  /** Accepted connections count. */
  connections: number
  /** The entitlement plan label (Member / Crew / Supporter). */
  planLabel: string
}

/** The member Hub's stats + nudge, or null when signed out (fail-safe). Reuses getProfileRailData for the
 *  profile bundle, then one row for Zaps/streak/plan and one HEAD count for accepted connections. */
export async function getMemberHubData(): Promise<MemberHubData | null> {
  const profile = await getProfileRailData()
  if (!profile) return null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: row } = await supabase
    .from('profiles')
    .select('id, lifetime_zaps, current_streak, membership_tier')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!row) return null

  // Accepted connections — a HEAD count over the caller's OWN edges (id is derived from the authed user,
  // so this never widens the read). Fail-safe to 0.
  const { count } = await supabase
    .from('friendships')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'accepted')
    .or(`user_a_id.eq.${row.id},user_b_id.eq.${row.id}`)

  const i = profile.initial
  const { percent, gaps } = computeCompleteness({
    displayName: i.displayName,
    handle: i.handle,
    bio: i.bio,
    avatarUrl: i.avatarUrl,
    headerImageUrl: i.headerImageUrl,
    city: i.city,
    website: i.website,
    spotlightEnabled: i.spotlightEnabled,
  })

  const spotlight: MemberHubData['spotlight'] = i.spotlightPublished
    ? 'live'
    : i.spotlightEnabled
      ? 'draft'
      : 'off'
  const tier = deriveTier((row.membership_tier ?? null) as EntitlementTier | null)

  return {
    handle: i.handle || null,
    completeness: percent,
    nudge: percent >= 100 ? null : gaps[0]?.nudge ?? null,
    spotlight,
    zaps: (row.lifetime_zaps as number | null) ?? 0,
    streak: (row.current_streak as number | null) ?? 0,
    connections: count ?? 0,
    planLabel: ENTITLEMENT_LABEL[tier],
  }
}

// ── The in-rail Profile page builder seed (ADR-516 Phase C) ──────────────────────────────────────────
// The builder + the live page preview seed the shared ProfileLayoutContext from the SAME persisted layout,
// resolved to the freeform rows. RE-GATES on the authed viewer (reads only the caller's own row) and
// returns NULL when signed out (fail-safe → the builder renders nothing). READ-ONLY + serializable (RowDef
// is plain data), so the client builder module self-fetches it exactly like the other rail getters.

export interface MemberLayoutRailData {
  handle: string | null
  /** The persisted freeform rows (resolveRows over the saved entityGrid → the basic starter when empty). */
  rows: RowDef[]
  /** The persisted hidden block ids (blocks kept in place but off the render). */
  hidden: string[]
  /** Whether the member has ever saved a layout (else the resolved rows are the default seed → show starters). */
  customized: boolean
}

/** The member's own resolved profile-page layout for the builder, or null when signed out (fail-safe). */
export async function getMemberLayoutRailData(): Promise<MemberLayoutRailData | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('handle, meta')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) return null

  const saved = readMemberGridLayout((profile as { meta?: unknown }).meta)
  return {
    handle: (profile as { handle?: string | null }).handle ?? null,
    rows: resolveRows(saved, 'member'),
    hidden: saved?.hidden ?? [],
    customized: !!(saved && (saved.rows?.length || saved.template || saved.slots || saved.order)),
  }
}

// ── The Spotlight appearance rail bundle (account.spotlightAppearance, ADR-525) ──────────────────────────
// The grid-side replacement for the retired Puck editor's look controls: the member's profile skin, their
// Spotlight page THEME (header framing + fonts), the page BACKGROUND (image + focus/dim/zoom), and their
// Top Friends. Everything the Appearance rail module needs in one read. RE-GATES on the authed viewer (reads
// ONLY the caller's own row + only THEIR accepted friends via getAcceptedFriendsForPicker) and returns NULL
// when signed out (fail-safe → the module renders nothing). The theme/background are VALIDATED here (the
// same read-side boundary the public renderer enforces), so the module always seeds from a safe subset.
// READ-ONLY + serializable; the module's own writes (setSpotlightTheme / setSpotlightBackground /
// updateProfileTheme / the Top Friends actions) each re-check auth server-side.

export interface AppearanceRailData {
  handle: string | null
  /** Whether the viewer may turn Spotlight on (gates the whole module — appearance is Spotlight chrome). */
  canEnableSpotlight: boolean
  /** Whether Spotlight is currently enabled (the writers require it, so the module tells the member). */
  spotlightEnabled: boolean
  /** The stored profile skin id (governed allowlist), or null for the default. */
  profileTheme: string | null
  /** The validated Spotlight page theme (header show/height/focusY + fonts + colour/card fields). */
  theme: SpotlightTheme
  /** The validated Spotlight page background (assetPath pinned to the owner + focus/dim/zoom). */
  background: SpotlightBackground
  /** The member's current ordered Top Friends (resolved to public identity fields). */
  topFriends: TopFriend[]
  /** Every accepted friend, as the picker's source list (only the caller's own friends). */
  friendOptions: TopFriend[]
}

/** The Spotlight appearance bundle for the rail module, or null when signed out / the profile is missing
 *  (fail-safe → the module renders nothing). */
export async function getAppearanceRailData(): Promise<AppearanceRailData | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, handle, meta, profile_theme')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) return null

  const meta = (profile as { meta?: unknown }).meta
  const profileId = profile.id as string
  const canEnableSpotlight = (await getProfileCapabilities(profileId)).has('spotlight.enable')

  const [topFriends, friendOptions] = await Promise.all([
    getTopFriendsForOwner(profileId),
    getAcceptedFriendsForPicker(profileId),
  ])

  return {
    handle: (profile as { handle?: string | null }).handle ?? null,
    canEnableSpotlight,
    spotlightEnabled: readSpotlightEnabled(meta),
    profileTheme: (profile as { profile_theme?: string | null }).profile_theme ?? null,
    theme: validateSpotlightTheme(readSpotlightThemeRaw(meta)),
    // The auth user id pins the background asset path to the owner's own folder, exactly as the public read.
    background: validateSpotlightBackground(readSpotlightBackgroundRaw(meta), user.id),
    topFriends,
    friendOptions,
  }
}
