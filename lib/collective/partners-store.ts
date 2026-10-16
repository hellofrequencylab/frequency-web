import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { passesCalendarPaintGate, type SpaceCalendarEventRow } from '@/lib/events/store'
import { spaceEventRowsToItems } from '@/lib/calendar/public-month'
import { eventDayKey } from '@/lib/events/calendar-grid'
import type { CalendarEvent } from '@/lib/calendar/item'
import { acceptedCrossListingSubjects } from './cross-listing-store'
import { canBePartner, collectiveListings, isPartnerHub, LIVE_PARTNER_STATUSES, partnerSlotsLeft, partnershipLive, type PartnerListing } from './partners'
import { partnershipRows, partnerSpacesById, type PartnerSpaceRow } from './partners-live-store'

// The Partners tab read (SCAN-982). authz-delegated: the page resolves the hub's visibility for the
// caller first. It reads partner Spaces as public directory entries only: no member list across
// partners, no chapter tree, nothing that controls another partner's Space.
interface PartnerEntry { id: string; slug: string; name: string; logoUrl: string | null; partnershipId: string; listings: PartnerListing[] }
interface PartnersView { hubId: string; hubName: string; partners: PartnerEntry[]; pending: PartnerEntry[]; listings: PartnerListing[]; slotsLeft: number; names: Record<string, string> }

const displayName = (space: PartnerSpaceRow) => space.brand_name?.trim() || space.name || space.slug
const entry = (space: PartnerSpaceRow, partnershipId: string, listings: PartnerListing[]): PartnerEntry =>
  ({ id: space.id, slug: space.slug, name: displayName(space), logoUrl: space.brand_logo_url ?? null, partnershipId, listings })

export async function loadPartnersView(hubId: string): Promise<PartnersView | null> {
  const hub = (await partnerSpacesById([hubId])).get(hubId)
  if (!hub || !isPartnerHub(hub)) return null
  const rows = await partnershipRows('hub_space_id', [hubId], LIVE_PARTNER_STATUSES)
  const spaces = await partnerSpacesById(rows.map(row => row.partner_space_id))
  const accepted = rows.filter(row => partnershipLive(row, hub, spaces.get(row.partner_space_id)))
  const pending = rows.filter(row => row.status === 'pending' && canBePartner(spaces.get(row.partner_space_id)))
  const memberIds = new Set([hub.id, ...accepted.map(row => row.partner_space_id)])
  // Each read runs through the consent RPC, which re-gates owners, visibility and both ends' standing.
  const reads: { target: string; kind: 'journey' | 'circle'; subject: Record<string, unknown> }[] = []
  const targets = [...memberIds]
  for (let offset = 0; offset < targets.length; offset += 4) {
    const batch = await Promise.all(targets.slice(offset, offset + 4).flatMap(target => (['circle', 'journey'] as const).map(async kind =>
      (await acceptedCrossListingSubjects(kind, target)).map(subject => ({ target, kind, subject })))))
    reads.push(...batch.flat())
  }
  const listings = collectiveListings(reads, memberIds)
  const names: Record<string, string> = { [hub.id]: displayName(hub) }
  for (const row of accepted) names[row.partner_space_id] = displayName(spaces.get(row.partner_space_id)!)
  return {
    hubId: hub.id, hubName: displayName(hub), names, listings, slotsLeft: partnerSlotsLeft(rows),
    partners: accepted.map(row => entry(spaces.get(row.partner_space_id)!, row.id, listings.filter(l => l.sourceSpaceId === row.partner_space_id)))
      .sort((a, b) => a.name.localeCompare(b.name)),
    pending: pending.map(row => entry(spaces.get(row.partner_space_id)!, row.id, [])).sort((a, b) => a.name.localeCompare(b.name)),
  }
}

const EVENT_COLS = 'id, slug, title, starts_at, ends_at, location, time_zone, is_cancelled, plan_id, status, visibility, removed_at, is_demo, space_id, scope_id, scope_type'
type ListedEventRow = SpaceCalendarEventRow & { space_id: string | null; scope_id: string | null; scope_type: string | null }

/** The shared calendar: public events of every cross-listed Circle and Journey in [fromDay, toDay).
 *  An event counts only when its home is the listing's source Space, so a listing never imports
 *  events another Space attached to the same Circle or Journey. */
export async function loadPartnersCalendarWindow(view: Pick<PartnersView, 'listings' | 'names'>, fromDay: string, toDay: string): Promise<CalendarEvent[]> {
  const span = (Date.parse(toDay) - Date.parse(fromDay)) / 86400000
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDay) || !/^\d{4}-\d{2}-\d{2}$/.test(toDay) || !(span > 0 && span <= 62)) throw new Error('Invalid calendar window')
  const sourceOf = new Map(view.listings.map(listing => [`${listing.kind}:${listing.id}`, listing.sourceSpaceId]))
  const byKind = (kind: 'journey' | 'circle') => [...new Set(view.listings.filter(l => l.kind === kind).map(l => l.id))]
  const rows = new Map<string, ListedEventRow>()
  const read = async (kind: 'journey' | 'circle', ids: string[]) => {
    for (let offset = 0; offset < ids.length; offset += 200) for (let from = 0; ; from += 500) {
      let query = createAdminClient().from('events').select(EVENT_COLS)
        .eq('status', 'published').in('visibility', ['public', 'unlisted']).is('removed_at', null).eq('is_demo', false)
        .gte('starts_at', `${fromDay}T00:00:00Z`).lt('starts_at', `${toDay}T00:00:00Z`)
      query = kind === 'circle' ? query.in('scope_type', ['circle', 'group']).in('scope_id', ids.slice(offset, offset + 200)) : query.in('plan_id', ids.slice(offset, offset + 200))
      const { data, error } = await query.order('starts_at').order('id').range(from, from + 499)
      if (error) throw new Error('The shared calendar could not be loaded.')
      const page = (data ?? []) as unknown as ListedEventRow[]
      for (const row of page) {
        const subject = kind === 'circle' ? row.scope_id : row.plan_id
        if (!subject || row.space_id !== sourceOf.get(`${kind}:${subject}`)) continue
        if (!passesCalendarPaintGate(row, `${fromDay}T00:00:00Z`)) continue
        const day = eventDayKey(row.starts_at)
        if (day && day >= fromDay && day < toDay) rows.set(row.id, row)
      }
      if (page.length < 500) break
    }
  }
  await Promise.all([read('circle', byKind('circle')), read('journey', byKind('journey'))])
  const ordered = [...rows.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.id.localeCompare(b.id))
  const label = new Map(ordered.map(row => [row.slug, row.space_id ? view.names[row.space_id] ?? null : null]))
  return (await spaceEventRowsToItems(ordered)).map(item => ({ ...item, sourceLabel: label.get(item.slug) ?? null }))
}

/** Invites and partnerships a Space's owner can answer or leave, from the partner side. */
export interface IncomingPartnerInvite { id: string; status: string; hubName: string; hubSlug: string }
export async function incomingPartnerInvites(spaceId: string): Promise<IncomingPartnerInvite[]> {
  const rows = await partnershipRows('partner_space_id', [spaceId], LIVE_PARTNER_STATUSES)
  const spaces = await partnerSpacesById(rows.flatMap(row => [row.hub_space_id, row.partner_space_id]))
  return rows.flatMap(row => {
    const hub = spaces.get(row.hub_space_id)
    if (!hub || !isPartnerHub(hub) || hub.owner_profile_id !== row.invited_by) return []
    if (row.status === 'accepted' && !partnershipLive(row, hub, spaces.get(row.partner_space_id))) return []
    return [{ id: row.id, status: row.status, hubName: displayName(hub), hubSlug: hub.slug }]
  }).sort((a, b) => a.hubName.localeCompare(b.hubName))
}
