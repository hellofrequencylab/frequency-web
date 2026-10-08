import { isCollectivePlan } from './member-spaces'
import type { Space } from '@/lib/spaces/types'
import type { CalendarEvent } from '@/lib/calendar/item'

export type NetworkParent = Pick<Space, 'id' | 'slug' | 'status' | 'plan' | 'networkConnected' | 'ownerProfileId'>
/** A downgraded, suspended, off-network or ownerless parent has no network home. */
export function collectiveNetworkOpen(parent: NetworkParent): boolean {
  return parent.status === 'active' && parent.networkConnected === true && !!parent.ownerProfileId && isCollectivePlan(parent.plan)
}
export interface MemberSpaceRow {
  id: string; slug: string; name: string; brand_name: string | null; brand_logo_url: string | null
  parent_id: string | null; owner_profile_id: string | null; status: string; visibility: string; network_connected: boolean; type: string
}
export interface PublicMemberSpace { id: string; slug: string; name: string; logoUrl: string | null }
/** Public directory is deliberately narrower than the owner's member-space management list. */
export function publicMemberSpaces(rows: readonly MemberSpaceRow[], parent: NetworkParent): PublicMemberSpace[] {
  if (!collectiveNetworkOpen(parent)) return []
  const seen = new Set<string>()
  return rows.filter(row => row.id !== parent.id && row.parent_id === parent.id && row.owner_profile_id === parent.ownerProfileId
    && row.status === 'active' && row.visibility === 'network' && row.network_connected === true && row.type !== 'root'
    && !!row.slug)
    .filter(row => { if (seen.has(row.id)) return false; seen.add(row.id); return true })
    .map(row => ({ id: row.id, slug: row.slug, name: row.brand_name?.trim() || row.name, logoUrl: row.brand_logo_url }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
/** A cancellation can appear only as calendar context, never as an upcoming invitation. */
export function liveNetworkUpcoming(items: readonly CalendarEvent[], fromDay: string, limit = 5): CalendarEvent[] {
  return items.filter(item => !item.isCancelled && item.dayKey >= fromDay && item.layer === 'events')
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey) || (a.startInstantIso ?? '').localeCompare(b.startInstantIso ?? ''))
    .slice(0, limit)
}
