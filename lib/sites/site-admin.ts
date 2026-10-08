import { createAdminClient } from '@/lib/supabase/admin'
import { getSpaceMembership } from '@/lib/spaces/membership'
import { spaceCapabilitiesFor } from '@/lib/spaces/entitlements'
import { listProgramYearEventRows } from '@/lib/calendar/admin-calendar'
import { eventDayKey } from '@/lib/events/calendar-grid'
import { formatEventWhen } from '@/lib/time/zone'
import { mensworkSign } from '@/lib/theme/menswork'
import {
  gatheringNote,
  pickProgramYear,
  programEventKind,
  programYearWindow,
  type ProgramEvent,
} from '@/lib/spaces/leadership'
import { passOpensSite, readSiteAdminPass } from '@/lib/sites/site-admin-pass'
import type { Space } from '@/lib/spaces/types'

// THE WEBSITE ADMIN PAGES' READS (LIVE-864). Server-only. The website's /admin pages render per request
// (never cached: they read a cookie), behind the pass the Frequency console mints (site-admin-pass.ts).
//
// 🔴 THE GATE. `siteAdminAllowed` is the only door: the pass must be valid, minted for THIS host and THIS
// Space, and the person on it must still be the Space's owner or an active editor-or-above member, read
// fresh on every view, so taking someone off the team closes the pages at their next click. A pass minted
// for platform staff (a read-only preview from the console) has no membership to re-check and lasts its
// twelve hours. Only after the gate do the pages read drafts (the calendar) and the private overview.

export async function siteAdminAllowed(token: string | undefined, host: string, space: Pick<Space, 'id' | 'ownerProfileId'>): Promise<boolean> {
  const pass = readSiteAdminPass(token)
  if (!passOpensSite(pass, host, space.id)) return false
  if (pass.staff) return true
  const isOwner = !!space.ownerProfileId && space.ownerProfileId === pass.profileId
  const membership = isOwner ? null : await getSpaceMembership(space.id, pass.profileId)
  const role = membership?.status === 'active' ? membership.role : null
  return spaceCapabilitiesFor(isOwner, role).canEditProfile
}

type Row = Record<string, unknown>

/** The Space owner's name and photo, for the overview's meta row. Null on any miss. */
export async function readSiteAdminAuthor(ownerProfileId: string | null): Promise<{ name: string; avatar: string | null } | null> {
  if (!ownerProfileId) return null
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => { select: (c: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: Row | null }> } } }
    }
    const { data } = await db.from('profiles').select('display_name, avatar_url').eq('id', ownerProfileId).maybeSingle()
    const name = typeof data?.display_name === 'string' ? data.display_name.trim() : ''
    if (!name) return null
    const avatar = typeof data?.avatar_url === 'string' && /^https:\/\//.test(data.avatar_url) ? data.avatar_url : null
    return { name, avatar }
  } catch {
    return null
  }
}

/** The program year's events (drafts included, the gate above already passed), the year they make, and the
 *  pencilled-in gatherings' notes by slug. */
export async function readSiteAdminYear(spaceId: string, now: Date): Promise<{ year: number; events: ProgramEvent[]; notes: Map<string, string> }> {
  const thisYear = now.getUTCFullYear()
  const rows = await listProgramYearEventRows(spaceId, {
    fromDay: programYearWindow(thisYear).fromDay,
    toDay: programYearWindow(thisYear + 1).toDay,
  })
  const notes = new Map<string, string>()
  const events: ProgramEvent[] = rows.flatMap((ev) => {
    const dayKey = eventDayKey(ev.starts_at)
    if (!dayKey) return []
    const end = ev.ends_at ? eventDayKey(ev.ends_at) : null
    const event: ProgramEvent = {
      slug: ev.slug,
      title: ev.title,
      dayKey,
      endDayKey: end && end > dayKey ? end : null,
      timeLabel: formatEventWhen(ev.starts_at, ev.time_zone, { style: 'time', withZone: false }) || null,
      draft: ev.status !== 'published',
      cancelled: !!ev.is_cancelled,
    }
    if (programEventKind(event) === 'gathering') {
      const note = gatheringNote(ev.description, mensworkSign(new Date(`${dayKey}T12:00:00Z`)).name)
      if (note) notes.set(ev.slug, note)
    }
    return [event]
  })
  const year = pickProgramYear(now, events.map((e) => e.dayKey))
  const { fromDay, toDay } = programYearWindow(year)
  return { year, events: events.filter((e) => e.dayKey >= fromDay && e.dayKey < toDay), notes }
}
