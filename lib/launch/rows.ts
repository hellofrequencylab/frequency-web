// The rows behind the launch done-checks (VLS-02). One small read per noun, by the Space, under the member's own session (RLS), so a schema change
// to any of them degrades to "not yet" instead of throwing (the lib/onboarding/status.ts rule). Server-only.

import { createClient } from '@/lib/supabase/server'
import { getConnectStatus } from '@/lib/billing/connect'
import type { LaunchRows, SetupExtras } from './done-checks'

export async function loadLaunchRows(spaceId: string, ownerProfileId: string, withExtras = false): Promise<LaunchRows | null> {
  const db = await createClient()
  const count = async (q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> => {
    const res = await q
    return res.error ? 0 : (res.count ?? 0)
  }
  const [spaceRes, eventCount, circleCount, journeyCount, contactCount, connect] = await Promise.all([
    db.from('spaces').select('preferences, tagline, about').eq('id', spaceId).maybeSingle(),
    count(db.from('events').select('id', { count: 'exact', head: true }).or(`space_id.eq.${spaceId},host_space_id.eq.${spaceId}`).eq('is_cancelled', false).is('removed_at', null)),
    count(db.from('circles').select('id', { count: 'exact', head: true }).eq('space_id', spaceId).eq('is_space_primary', false)),
    count(db.from('journey_plans').select('id', { count: 'exact', head: true }).eq('space_id', spaceId)),
    count(db.from('contacts').select('id', { count: 'exact', head: true }).eq('space_id', spaceId)),
    getConnectStatus(ownerProfileId).catch(() => null),
  ])
  const extras: SetupExtras | undefined = withExtras
    ? await (async () => {
        const [bookingTimes, membershipTiers, donationAsks, products, campaigns, campaignsSent, captureLinks, automations] = await Promise.all([
          count(db.from('space_availability').select('id', { count: 'exact', head: true }).eq('space_id', spaceId)),
          count(db.from('space_membership_tiers').select('id', { count: 'exact', head: true }).eq('space_id', spaceId).eq('is_active', true)),
          count(db.from('space_donation_asks').select('id', { count: 'exact', head: true }).eq('space_id', spaceId).eq('is_active', true)),
          count(db.from('commerce_products').select('id', { count: 'exact', head: true }).eq('owner_space_id', spaceId).neq('status', 'archived')),
          count(db.from('campaigns').select('id', { count: 'exact', head: true }).eq('space_id', spaceId)),
          count(db.from('campaigns').select('id', { count: 'exact', head: true }).eq('space_id', spaceId).not('sent_at', 'is', null)),
          count(db.from('lead_entry_points').select('id', { count: 'exact', head: true }).eq('space_id', spaceId)),
          count(db.from('space_automation_rules').select('id', { count: 'exact', head: true }).eq('space_id', spaceId)),
        ])
        return { bookingTimes, membershipTiers, donationAsks, products, campaigns, campaignsSent, captureLinks, automations }
      })()
    : undefined
  const space = spaceRes.data as { preferences: unknown; tagline: string | null; about: string | null } | null
  if (!space) return null
  return {
    preferences: space.preferences,
    tagline: space.tagline,
    about: space.about,
    eventCount,
    circleCount,
    journeyCount,
    contactCount,
    payoutsReady: connect?.ready === true,
    extras,
  }
}
