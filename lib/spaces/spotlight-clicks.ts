import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { briefError, log } from '@/lib/log'
import { clientIp, rateLimitOk } from '@/lib/rate-limit'
import { readSpaceSpotlight } from './spotlight'

// SPOTLIGHT CLICK COUNTS (LIVE-856, PR 7 of the Space Spotlight). A press on a Link card sends a beacon to
// POST /api/spotlight/click on Frequency, or to `/spotlight-click` on a website host (its own origin, so the
// page's connect-src allows it; lib/sites/host.ts rewrites it to app/hosted/[host]/spotlight-click). Both
// routes answer with handleSpotlightClick. This module checks the press and writes one row to space_spotlight_clicks, and reads
// the totals for the console. No visitor data is stored (see the migration), so no consent gate applies.
// Server-only, service-role client: the table is internal.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TARGET = /^(book|contact|(product|journey|event|membership):[A-Za-z0-9_-]{1,64})$/

/** Is this a Link cards target id a click may name? PURE. */
export function isSpotlightClickTarget(target: unknown): target is string {
  return typeof target === 'string' && TARGET.test(target)
}

/** Record one press. Only a Space whose Spotlight is published counts. Never throws: a lost click is a
 *  smaller harm than a failed page, and a failure is logged so it is visible. */
export async function recordSpotlightClick(spaceId: unknown, target: unknown): Promise<boolean> {
  if (typeof spaceId !== 'string' || !UUID.test(spaceId) || !isSpotlightClickTarget(target)) return false
  try {
    const { data } = await createAdminClient().from('spaces').select('preferences').eq('id', spaceId).maybeSingle()
    if (!data || !readSpaceSpotlight((data as { preferences: unknown }).preferences).published) return false
    const { error } = await createAdminClient().from('space_spotlight_clicks').insert({ space_id: spaceId, target })
    if (error) throw error
    return true
  } catch (err) {
    log.warn('spotlight_click_record_failed', { spaceId, message: briefError(err) })
    return false
  }
}

/** Presses per Link card target over the last `days` days. Empty on any failure (logged). */
export async function readSpotlightClicks(spaceId: string, days = 30): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  try {
    const since = new Date(Date.now() - days * 86_400_000).toISOString()
    const { data, error } = await createAdminClient()
      .from('space_spotlight_clicks')
      .select('target')
      .eq('space_id', spaceId)
      .gte('clicked_at', since)
      .limit(20_000)
    if (error) throw error
    for (const row of data ?? []) counts.set(row.target, (counts.get(row.target) ?? 0) + 1)
  } catch (err) {
    log.warn('spotlight_click_read_failed', { spaceId, message: briefError(err) })
  }
  return counts
}

/** The beacon endpoint both routes share. The body is text/plain JSON `{ space, target }`, so a browser sends
 *  it with no preflight. Always 204: the page never waits on it. An unconfigured rate limiter ALLOWS here
 *  (lib/rate-limit.ts 'allow'): the worst abuse is an inflated count on one Space, and denying would silently
 *  stop every count. */
export async function handleSpotlightClick(req: Request): Promise<Response> {
  if (await rateLimitOk('spotlight-click', clientIp(req), 60, '60 s', { whenUnconfigured: 'allow' })) {
    try {
      const body = JSON.parse(await req.text()) as { space?: unknown; target?: unknown }
      await recordSpotlightClick(body?.space, body?.target)
    } catch {
      // A malformed beacon is dropped.
    }
  }
  return new Response(null, { status: 204 })
}
