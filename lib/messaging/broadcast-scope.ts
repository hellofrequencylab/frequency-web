// BROADCAST SCOPE GUARD (SCAN-749).
//
// Who may point a Dispatch at a given audience. One rule, shared by the create path
// (app/(main)/nearby/actions.ts) and the operator edit path (app/(main)/admin/actions.ts) so a
// retargeted Dispatch obeys the same association guard a new one does: an admin tier (community
// janitor+) may broadcast anywhere, global included; everyone else may only broadcast to a scope
// they LEAD (the circle's host, the hub's guide, the nexus's mentor, walking up the tree).
//
// Service-role reads; the CALLER has already authenticated the profile it passes in.

import { createAdminClient } from '@/lib/supabase/admin'
import { atLeastRole, type CommunityRole } from '@/lib/core/roles'

export type BroadcastCaller = { id: string; community_role: CommunityRole }

/** Throws a plain-sentence Error when `caller` may not broadcast to `audienceId` under `scope`. */
export async function assertCanBroadcastTo(
  caller: BroadcastCaller,
  scope: string,
  audienceId: string | null | undefined,
): Promise<void> {
  const isGlobal = scope === 'global'
  // Global reaches every member — staff/janitor only (Phase D, ADR-088).
  if (isGlobal && !atLeastRole(caller.community_role, 'janitor')) {
    throw new Error('Only staff can broadcast globally.')
  }
  if (!scope || (!isGlobal && !audienceId)) throw new Error('Missing required fields')
  // An admin tier (janitor+) may broadcast anywhere.
  if (atLeastRole(caller.community_role, 'janitor')) return

  const admin = createAdminClient()
  let led = false
  if (scope === 'circle') {
    const { data: c } = await admin.from('circles').select('host_id, hub_id').eq('id', audienceId!).maybeSingle()
    if (c?.host_id === caller.id) led = true
    else if (c?.hub_id) {
      const { data: h } = await admin.from('hubs').select('guide_id, nexus_id').eq('id', c.hub_id).maybeSingle()
      if (h?.guide_id === caller.id) led = true
      else if (h?.nexus_id) {
        const { data: n } = await admin.from('nexus_regions').select('mentor_id').eq('id', h.nexus_id).maybeSingle()
        if (n?.mentor_id === caller.id) led = true
      }
    }
  } else if (scope === 'hub') {
    const { data: h } = await admin.from('hubs').select('guide_id, nexus_id').eq('id', audienceId!).maybeSingle()
    if (h?.guide_id === caller.id) led = true
    else if (h?.nexus_id) {
      const { data: n } = await admin.from('nexus_regions').select('mentor_id').eq('id', h.nexus_id).maybeSingle()
      if (n?.mentor_id === caller.id) led = true
    }
  } else if (scope === 'nexus') {
    const { data: n } = await admin.from('nexus_regions').select('mentor_id').eq('id', audienceId!).maybeSingle()
    if (n?.mentor_id === caller.id) led = true
  }
  if (!led) throw new Error('You can only broadcast to a circle, hub, or region you lead.')
}
