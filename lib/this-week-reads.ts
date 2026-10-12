// The database half of "This week in <region>" (LIVE-806). Every read the Thursday cron makes,
// behind the admin client, so the route (app/api/cron/this-week/route.ts) stays a loop and the
// pure half (lib/this-week.ts) stays import-free. The route test mocks this module whole, the way
// the digest route test mocks lib/digest.
//
// The admin client bypasses RLS, so the public-only gate is re-applied here on every row before
// an Event can reach an inbox: the same clauses as the master calendar's public arm
// (lib/events/store.ts masterCalendarIncludes), minus `unlisted`, because this is a push we
// initiate, not a link the member followed (the follower-reminder rule, lib/events/follower-reminders.ts).

import { createAdminClient } from '@/lib/supabase/admin'
import { thisWeekQueryBand, type ThisWeekEventRow, type ThisWeekRegion } from '@/lib/this-week'

/** Every seeded region, name and slug. The seed (20240107000000) is the dropdown at onboarding
 *  Step 3, so this is also the whole set a member can call home. */
export async function listRegions(): Promise<ThisWeekRegion[]> {
  const { data, error } = await createAdminClient().from('nexus_regions').select('id, name, slug').order('name')
  if (error) throw new Error(`nexus_regions read failed: ${error.message}`)
  return ((data ?? []) as ThisWeekRegion[]).map((r) => ({ id: r.id, name: r.name, slug: r.slug }))
}

/**
 * Public, published, live Events scoped to a region whose stored start is inside the WIDENED band
 * (lib/this-week.ts thisWeekQueryBand). The precise seven-day cut happens in the pure selector,
 * because `starts_at` is the Event's wall-clock kept as UTC parts.
 */
export async function listUpcomingPublicEventsByRegion(now: Date): Promise<ThisWeekEventRow[]> {
  const { fromIso, toIso } = thisWeekQueryBand(now)
  const { data, error } = await createAdminClient()
    .from('events')
    .select('id, slug, title, starts_at, time_zone, location, venue_name, city, scope_region_id')
    .eq('scope_type', 'public')
    .not('scope_region_id', 'is', null)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .eq('is_cancelled', false)
    .eq('is_demo', false)
    .is('removed_at', null)
    .gte('starts_at', fromIso)
    .lte('starts_at', toIso)
    .order('starts_at', { ascending: true })
    .limit(2000)
  if (error) throw new Error(`events read failed: ${error.message}`)
  return (data ?? []) as ThisWeekEventRow[]
}

interface ThisWeekRecipient {
  profileId: string
  displayName: string
  regionId: string
  authUserId: string
}

/**
 * The CANDIDATE set for the regions that have something to say: every real, unsuspended member
 * whose home region is one of `regionIds` and who has an account to mail. A candidate set, not a
 * send list: preference, lifecycle consent and suppression are one decision downstream in the
 * route (`resolveSendGate`, ADR-169), and nothing here grows a second copy of it.
 */
export async function listRecipientsInRegions(regionIds: readonly string[]): Promise<ThisWeekRecipient[]> {
  if (regionIds.length === 0) return []
  const { data, error } = await createAdminClient()
    .from('profiles')
    .select('id, display_name, nexus_region_id, auth_user_id')
    .in('nexus_region_id', [...regionIds])
    .eq('is_demo', false)
    .is('suspended_at', null)
    .not('auth_user_id', 'is', null)
  if (error) throw new Error(`profiles read failed: ${error.message}`)
  type Row = { id: string; display_name: string | null; nexus_region_id: string | null; auth_user_id: string | null }
  return ((data ?? []) as Row[])
    .filter((r): r is Row & { nexus_region_id: string; auth_user_id: string } => !!r.nexus_region_id && !!r.auth_user_id)
    .map((r) => ({
      profileId: r.id,
      displayName: (r.display_name ?? '').trim() || 'there',
      regionId: r.nexus_region_id,
      authUserId: r.auth_user_id,
    }))
}

/** The account email: it lives in auth.users, never on profiles (lib/profiles/account-email.ts
 *  says why). Null when the auth user or the address is missing. */
export async function recipientEmail(authUserId: string): Promise<string | null> {
  const { data } = await createAdminClient().auth.admin.getUserById(authUserId)
  return data?.user?.email ?? null
}
