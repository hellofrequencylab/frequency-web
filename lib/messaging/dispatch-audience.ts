import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

export type DispatchPlaceScope = 'circle' | 'hub' | 'nexus'

export const DISPATCH_PLACE_SCOPES: readonly DispatchPlaceScope[] = ['circle', 'hub', 'nexus']

export function isDispatchPlaceScope(v: unknown): v is DispatchPlaceScope {
  return typeof v === 'string' && (DISPATCH_PLACE_SCOPES as readonly string[]).includes(v)
}

/**
 * Association guard for a Dispatch audience (SCAN-749). A non-staff caller may only
 * broadcast to a scope they LEAD: the circle's host, the hub's guide, or the region's
 * mentor matching the audience, walking UP the tree (a region mentor leads every hub
 * and circle beneath them). Staff callers never reach this: they broadcast anywhere.
 *
 * Shared by the create path (nearby/actions) and the edit path (admin/actions), so a
 * retarget on edit is held to the same rule as the original send.
 */
export async function assertCanBroadcastTo(
  callerId: string,
  scope: string,
  audienceId: string | null | undefined,
): Promise<void> {
  if (!isDispatchPlaceScope(scope) || !audienceId) {
    throw new Error('You can only broadcast to a circle, hub, or region you lead.')
  }
  const admin = createAdminClient()
  let led = false
  if (scope === 'circle') {
    const { data: c } = await admin.from('circles').select('host_id, hub_id').eq('id', audienceId).maybeSingle()
    if (c?.host_id === callerId) led = true
    else if (c?.hub_id) {
      const { data: h } = await admin.from('hubs').select('guide_id, nexus_id').eq('id', c.hub_id).maybeSingle()
      if (h?.guide_id === callerId) led = true
      else if (h?.nexus_id) {
        const { data: n } = await admin.from('nexus_regions').select('mentor_id').eq('id', h.nexus_id).maybeSingle()
        if (n?.mentor_id === callerId) led = true
      }
    }
  } else if (scope === 'hub') {
    const { data: h } = await admin.from('hubs').select('guide_id, nexus_id').eq('id', audienceId).maybeSingle()
    if (h?.guide_id === callerId) led = true
    else if (h?.nexus_id) {
      const { data: n } = await admin.from('nexus_regions').select('mentor_id').eq('id', h.nexus_id).maybeSingle()
      if (n?.mentor_id === callerId) led = true
    }
  } else {
    const { data: n } = await admin.from('nexus_regions').select('mentor_id').eq('id', audienceId).maybeSingle()
    if (n?.mentor_id === callerId) led = true
  }
  if (!led) throw new Error('You can only broadcast to a circle, hub, or region you lead.')
}
