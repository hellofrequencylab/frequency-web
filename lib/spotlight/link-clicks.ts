import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { briefError, log } from '@/lib/log'
import { readSpotlightPublished } from '@/lib/profile/spotlight-flags'
import { readPageSettings, visibleLinks } from './link-in-bio'

// PERSONAL SPOTLIGHT LINK PRESS COUNTS (LIVE-1954). A press on a link of a member's Spotlight sends a beacon to
// POST /api/spotlight/click `{ profile, link }`; lib/spaces/spotlight-clicks.ts routes it here. One identity-free
// row per press (member_spotlight_link_clicks), read back for the owner in the editor. Server-only, service
// role: the table is internal.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LINK_ID = /^[A-Za-z0-9_-]{1,40}$/

/** Is this a link id a press may name? PURE. */
export function isMemberLinkId(v: unknown): v is string {
  return typeof v === 'string' && LINK_ID.test(v)
}

/** Record one press. Only a published Spotlight counts, and only for a link that is on the page right now.
 *  Never throws: a lost click is a smaller harm than a failed page, and a failure is logged. */
export async function recordMemberLinkClick(profileId: unknown, linkId: unknown): Promise<boolean> {
  if (typeof profileId !== 'string' || !UUID.test(profileId) || !isMemberLinkId(linkId)) return false
  try {
    const db = createAdminClient()
    const { data } = await db.from('profiles').select('meta').eq('id', profileId).maybeSingle()
    const meta = (data as { meta: unknown } | null)?.meta
    if (!data || !readSpotlightPublished(meta)) return false
    if (!visibleLinks(readPageSettings(meta).links).some((l) => l.id === linkId)) return false
    const { error } = await db.from('member_spotlight_link_clicks').insert({ profile_id: profileId, link_id: linkId })
    if (error) throw error
    return true
  } catch (err) {
    log.warn('member_link_click_record_failed', { profileId, message: briefError(err) })
    return false
  }
}

/** Presses per link id over the last `days` days. Empty on any failure (logged). */
export async function readMemberLinkClicks(profileId: string, days = 30): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  try {
    const since = new Date(Date.now() - days * 86_400_000).toISOString()
    const { data, error } = await createAdminClient()
      .from('member_spotlight_link_clicks')
      .select('link_id')
      .eq('profile_id', profileId)
      .gte('clicked_at', since)
      .limit(20_000)
    if (error) throw error
    for (const row of data ?? []) counts[row.link_id] = (counts[row.link_id] ?? 0) + 1
  } catch (err) {
    log.warn('member_link_click_read_failed', { profileId, message: briefError(err) })
  }
  return counts
}
