import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  readSpotlightPublished,
  readSpotlightLayoutRaw,
  readSpotlightBackgroundRaw,
} from '@/lib/profile/spotlight-flags'
import { validateSpotlightLayout, validateSpotlightBackground } from '@/lib/spotlight/blocks/validate'
import type { SpotlightLayout, SpotlightBackground } from '@/lib/spotlight/blocks/schema'
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
}

/**
 * Load a member's published Spotlight by handle, or null when it doesn't exist, is
 * inactive/system, or is not published. The publish gate reads `meta` in isolation;
 * the returned profile carries only allowlisted columns.
 */
export async function getPublishedSpotlight(handle: string): Promise<SpotlightData | null> {
  const admin = createAdminClient()

  // Gate: resolve the profile + its publish flag + editor layout from meta (meta itself
  // is never returned — only the validated layout/background derived from it).
  const { data: gate } = await admin
    .from('profiles')
    .select('id, auth_user_id, is_active, is_system, meta')
    .eq('handle', handle)
    .maybeSingle()

  const g = gate as { id?: string; auth_user_id?: string | null; is_active?: boolean; is_system?: boolean; meta?: unknown } | null
  if (!g?.id || g.is_active === false || g.is_system === true) return null
  if (!readSpotlightPublished(g.meta)) return null

  // Validate the stored layout/background ON READ (the security boundary): a tampered
  // meta blob is coerced to a safe subset, asset paths pinned to this owner's folder.
  const ownerAuthId = g.auth_user_id ?? ''
  const layout = validateSpotlightLayout(readSpotlightLayoutRaw(g.meta), ownerAuthId)
  const background = validateSpotlightBackground(readSpotlightBackgroundRaw(g.meta), ownerAuthId)

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

  return {
    profile: row as unknown as SpotlightRow,
    hostedEvents: (events ?? []) as SpotlightHostedEvent[],
    layout,
    background,
  }
}
