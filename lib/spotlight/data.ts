import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  readSpotlightPublished,
  readSpotlightLayoutRaw,
  readSpotlightBackgroundRaw,
  readSpotlightThemeRaw,
} from '@/lib/profile/spotlight-flags'
import { validateSpotlightLayout, validateSpotlightBackground } from '@/lib/spotlight/blocks/validate'
import type { SpotlightLayout, SpotlightBackground } from '@/lib/spotlight/blocks/schema'
import { validateSpotlightTheme, type SpotlightTheme } from '@/lib/spotlight/theme'
import { readMemberGridLayout } from '@/lib/entity-blocks/member-grid-meta'
import type { EntityLayout } from '@/lib/entity-blocks/layout'
import { getTopFriendsForOwner, type TopFriend } from './top-friends'
import { SPOTLIGHT_SELECT, type SpotlightRow } from './privacy'

// Server data for the PUBLIC Spotlight page. Anonymous visitors get no RLS, so this
// reads through the admin client and is fail-closed: it returns null unless the page
// is explicitly PUBLISHED. The published flag lives in `meta` (PII), so it is read in
// a SEPARATE gate query and never returned — the page row itself is the strict
// SPOTLIGHT_SELECT allowlist, with no meta/contact/geo columns.

export interface SpotlightHostedEvent {
  id: string
  slug: string
  title: string
  starts_at: string
}

export interface SpotlightData {
  profile: SpotlightRow
  hostedEvents: SpotlightHostedEvent[]
  /** The member's validated block layout (empty when they haven't customized). */
  layout: SpotlightLayout
  /** The validated optional background image. */
  background: SpotlightBackground
  /** The validated custom theme (colours/gradient/fonts/card). */
  theme: SpotlightTheme
  /** Lifetime Zaps earned (one SQL aggregate) — a gamification stat the member can display. */
  totalZaps: number
  /** The member's ordered Top Friends (the "Top 8"), resolved server-side from the
   *  spotlight_top_friends table joined to each friend's public profile. Empty when none. */
  topFriends: TopFriend[]
  /** The member's saved unified GRID layout (ADR-508 U2b), read fail-safe off meta.entityGrid. Null when
   *  absent / malformed so the module render falls back to the fresh member default. DELIBERATELY
   *  separate from the live Puck nodes (meta.spotlight.*): reading it never affects the Puck render. */
  grid: EntityLayout | null
}

/**
 * Load a member's published Spotlight by handle, or null when it doesn't exist, is
 * inactive/system, or is not published. The publish gate reads `meta` in isolation;
 * the returned profile carries only allowlisted columns.
 *
 * This is the PUBLIC mini-site reader (fail-closed on publish). The in-app profile uses
 * `getMemberProfileModules` (below), which shares this exact safe/allowlisted read but
 * drops the publish gate.
 */
export async function getPublishedSpotlight(handle: string): Promise<SpotlightData | null> {
  return loadMemberSpotlight(handle, { requirePublished: true })
}

/**
 * Load a member's profile-block data for the IN-APP profile (`/people/<handle>`), decoupled from the
 * Spotlight publish gate (ADR-522). Every signed-in member's own grid renders here regardless of tier or
 * `meta.spotlight.published`, so the in-app profile looks uniform member-to-member. The read stays exactly
 * as SAFE as the public reader — admin client, the SPOTLIGHT_SELECT column allowlist, layout validated on
 * read — just NOT publish/tier-gated. Returns null only when the profile is missing / inactive / system.
 *
 * DELIBERATELY does not gate on publish: the public `/spotlight` mini-site keeps its own gate
 * (getPublishedSpotlight). The member's saved grid (meta.entityGrid → `.grid`) drives the render; the
 * caller falls back to the default starter layout via resolveRows when it is null.
 */
export async function getMemberProfileModules(handle: string): Promise<SpotlightData | null> {
  return loadMemberSpotlight(handle, { requirePublished: false })
}

/**
 * The shared reader behind both entry points. `requirePublished` is the ONLY difference: the public
 * mini-site fails closed on it; the in-app profile does not. Everything else (the column allowlist, the
 * validate-on-read security boundary, the derived grid) is identical, so the two surfaces never drift.
 */
async function loadMemberSpotlight(
  handle: string,
  { requirePublished }: { requirePublished: boolean },
): Promise<SpotlightData | null> {
  const admin = createAdminClient()

  // Gate: resolve the profile + its publish flag + editor layout from meta (meta itself
  // is never returned — only the validated layout/background derived from it).
  const { data: gate } = await admin
    .from('profiles')
    .select('id, auth_user_id, is_active, is_system, meta, lifetime_zaps')
    .eq('handle', handle)
    .maybeSingle()

  const g = gate as { id?: string; auth_user_id?: string | null; is_active?: boolean; is_system?: boolean; meta?: unknown; lifetime_zaps?: number | null } | null
  if (!g?.id || g.is_active === false || g.is_system === true) return null
  if (requirePublished && !readSpotlightPublished(g.meta)) return null

  // Validate the stored layout/background ON READ (the security boundary): a tampered
  // meta blob is coerced to a safe subset, asset paths pinned to this owner's folder.
  const ownerAuthId = g.auth_user_id ?? ''
  const layout = validateSpotlightLayout(readSpotlightLayoutRaw(g.meta), ownerAuthId)
  const background = validateSpotlightBackground(readSpotlightBackgroundRaw(g.meta), ownerAuthId)
  const theme = validateSpotlightTheme(readSpotlightThemeRaw(g.meta))

  // Page row: the explicit allowlist only.
  const { data: row } = await admin
    .from('profiles')
    .select(SPOTLIGHT_SELECT)
    .eq('id', g.id)
    .maybeSingle()
  if (!row) return null

  // Upcoming events this member hosts (public, not cancelled). Best-effort.
  const { data: events } = await admin
    .from('events')
    .select('id, slug, title, starts_at')
    .eq('host_id', g.id)
    .eq('status', 'published')
    .eq('is_cancelled', false)
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(5)

  // Lifetime Zaps from the authoritative profiles.lifetime_zaps column — the same
  // headline number the dashboard and the profile standing show. (The old
  // crew_completions-only subtotal read 0 for members whose Zaps come from posts,
  // reactions, joins, etc., so the stat never appeared.)
  const totalZaps = Number(g.lifetime_zaps ?? 0)

  // The ordered Top Friends grid (resolved to each friend's public profile fields).
  const topFriends = await getTopFriendsForOwner(g.id)

  // The member's saved unified grid layout (U3 module render), read fail-safe off the SAME meta blob the
  // publish/layout gate already loaded — no extra query. Never returned raw; only the parsed layout.
  const grid = readMemberGridLayout(g.meta)

  return {
    profile: row as unknown as SpotlightRow,
    hostedEvents: (events ?? []) as SpotlightHostedEvent[],
    layout,
    background,
    theme,
    totalZaps,
    topFriends,
    grid,
  }
}
