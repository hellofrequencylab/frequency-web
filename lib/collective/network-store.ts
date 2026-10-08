import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { listSpaceCalendarEvents, type SpaceCalendarEvent } from '@/lib/events/store'
import { spaceEventRowsToItems } from '@/lib/calendar/public-month'
import { eventDayKey } from '@/lib/events/calendar-grid'
import type { CalendarEvent } from '@/lib/calendar/item'
import { collectiveNetworkOpen, publicMemberSpaces, type NetworkParent, type PublicMemberSpace, type MemberSpaceRow } from './network'

const MEMBER_COLS = 'id, slug, name, brand_name, brand_logo_url, parent_id, owner_profile_id, status, visibility, network_connected, type'
/** authz-delegated: page/action resolve the parent's visibility first. This public projection never
 * consumes loadMemberSpaceManagement (which contains private siblings for the owner). */
export const listPublicCollectiveMembers = cache(async (parent: NetworkParent): Promise<PublicMemberSpace[]> => {
  if (!collectiveNetworkOpen(parent)) return []
  const rows: MemberSpaceRow[] = []
  const admin = createAdminClient()
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await admin.from('spaces').select(MEMBER_COLS)
      .eq('parent_id', parent.id).eq('owner_profile_id', parent.ownerProfileId!)
      .eq('status', 'active').eq('visibility', 'network').eq('network_connected', true).neq('type', 'root')
      .order('name').order('id').range(offset, offset + 499)
    if (error) throw new Error('The network directory could not be loaded.')
    const page = (data ?? []) as MemberSpaceRow[]
    rows.push(...page)
    if (page.length < 500) break
  }
  return publicMemberSpaces(rows, parent)
})

/** Public calendar composition over the existing tenancy/hosting/accepted-share reader. Each
 * child must pass the public Space projection before its owned-event branch can be read. */
export async function loadCollectiveNetworkWindow(parent: NetworkParent, ownName: string, fromDay: string, toDay: string): Promise<CalendarEvent[]> {
  if (!collectiveNetworkOpen(parent)) return []
  const members = await listPublicCollectiveMembers(parent)
  const sources = [{ id: parent.id, name: ownName }, ...members]
  const rows: { source: typeof sources[number]; events: SpaceCalendarEvent[] }[] = []
  // Large purchased networks must not open one database request per Space at once.
  for (let offset = 0; offset < sources.length; offset += 4) {
    rows.push(...await Promise.all(sources.slice(offset, offset + 4).map(async source => ({ source,
      events: await listSpaceCalendarEvents(source.id, { fromDay, toDay, exhaustive: true, paintCancelled: true }),
    }))))
  }
  const byId = new Map<string, { row: SpaceCalendarEvent; names: Set<string> }>()
  for (const { source, events } of rows) for (const row of events) {
    const day = eventDayKey(row.starts_at)
    if (!day || day < fromDay || day >= toDay) continue
    const prior = byId.get(row.id)
    if (prior) {
      prior.names.add(source.name)
      // If cancellation changes during the parallel reads, the conservative view wins.
      if (row.is_cancelled) prior.row = row
    } else byId.set(row.id, { row, names: new Set([source.name]) })
  }
  const ordered = [...byId.values()].sort((a, b) => a.row.starts_at.localeCompare(b.row.starts_at) || a.row.id.localeCompare(b.row.id))
  const items = await spaceEventRowsToItems(ordered.map(entry => entry.row))
  return items.map((item, i) => ({ ...item, sourceLabel: [...ordered[i].names].join(' · ') }))
}
