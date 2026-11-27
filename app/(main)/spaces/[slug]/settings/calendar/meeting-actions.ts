'use server'

import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { listSpaceMembers } from '@/lib/spaces/membership'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { getCalendarEntryRow } from '@/lib/calendar/entries-store'
import { entryKind } from '@/lib/calendar/registry'
import { resolveCommentAuthors } from '@/lib/calendar/plan-comments-store'
import { recordPlanActivity } from '@/lib/calendar/plan-activity-store'
import { notesToTodos, type NotesPerson, type TodoProposal } from '@/lib/calendar/meeting-notes'
import { createTask } from '@/lib/crm/tasks'

// A MEETING'S NOTES BECOME TO-DOS (LIVE-2533). Two doors, the propose-then-accept shape every Vera
// surface keeps (ADR-1386: Vera never writes on her own). `proposeMeetingTodos` reads the meeting's
// notes and returns the to-dos in them, writing nothing. `acceptMeetingTodos` takes the lines a person
// kept, re-checks each one here (never trusting the browser), and files them as to-dos on the Space,
// on the meeting's Plan when it has one, with the owner and due day the person settled on.
// The meeting is read on the caller's own session, so the calendar's RLS decides who gets this far.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

interface MeetingSeat {
  spaceId: string
  profileId: string
  meeting: NonNullable<Awaited<ReturnType<typeof getCalendarEntryRow>>>
  people: NotesPerson[]
}

async function meetingSeat(slug: string, entryId: string): Promise<MeetingSeat | { error: string }> {
  if (typeof slug !== 'string' || typeof entryId !== 'string' || !UUID_RE.test(entryId)) return { error: 'That meeting no longer exists.' }
  const caller = await getCallerProfile()
  if (!caller?.id) return { error: 'You do not have access to this calendar.' }
  const space = await getVisibleSpaceBySlug(slug, caller.id)
  if (!space) return { error: 'You do not have access to this calendar.' }
  const caps = await getSpaceCapabilities(space, caller.id)
  if (!caps.canEditProfile || !spaceFunctionAccess(space, 'events', caps.role)) return { error: 'You do not have access to this calendar.' }
  const meeting = await getCalendarEntryRow(space.id, entryId)
  if (!meeting || !entryKind(meeting.kind)?.isMeeting) return { error: 'That meeting no longer exists.' }
  // Who a to-do can go to: the people who work this Space's calendar.
  const ids = new Set<string>()
  if (space.ownerProfileId) ids.add(space.ownerProfileId)
  for (const m of await listSpaceMembers(space.id)) if (m.status === 'active' && m.role !== 'viewer') ids.add(m.profileId)
  const names = await resolveCommentAuthors([...ids])
  const people = [...ids].map((id) => ({ id, name: names.get(id) ?? '' })).filter((p) => p.name)
  return { spaceId: space.id, profileId: caller.id, meeting, people }
}

export interface MeetingTodosView {
  todos: TodoProposal[]
  people: NotesPerson[]
}

/** Vera reads the meeting's notes and proposes the to-dos in them. Writes nothing. */
export async function proposeMeetingTodos(slug: string, entryId: string): Promise<ActionResult<MeetingTodosView>> {
  const seat = await meetingSeat(slug, entryId)
  if ('error' in seat) return fail(seat.error)
  const notes = seat.meeting.notes ?? ''
  if (!notes.trim()) return fail('Add the meeting notes first, then Vera can find the to-dos in them.')
  const meetingDay = seat.meeting.starts_at.slice(0, 10)
  return ok({ todos: notesToTodos(notes, { people: seat.people, meetingDay }), people: seat.people })
}

/** File the to-dos a person kept. Each line is re-read here: a title, an owner on this Space's team
 *  or nobody, and a real day or none. */
export async function acceptMeetingTodos(
  slug: string,
  entryId: string,
  raw: unknown,
): Promise<ActionResult<{ added: number }>> {
  const seat = await meetingSeat(slug, entryId)
  if ('error' in seat) return fail(seat.error)
  const team = new Set(seat.people.map((p) => p.id))
  const lines = (Array.isArray(raw) ? raw : []).slice(0, 20)
  let added = 0
  for (const l of lines) {
    if (!l || typeof l !== 'object') continue
    const r = l as Record<string, unknown>
    const title = typeof r.title === 'string' ? r.title.replace(/\s+/g, ' ').trim().slice(0, 200) : ''
    if (!title) continue
    const assignee = typeof r.assigneeProfileId === 'string' && team.has(r.assigneeProfileId) ? r.assigneeProfileId : null
    const dueDay = typeof r.dueDay === 'string' && DAY_RE.test(r.dueDay) && !Number.isNaN(Date.parse(r.dueDay)) ? r.dueDay : null
    const res = await createTask(
      {
        createdBy: seat.profileId,
        title,
        assigneeProfileId: assignee,
        // Noon UTC on the day, like every other day-only to-do.
        dueAt: dueDay ? `${dueDay}T12:00:00.000Z` : null,
        planId: seat.meeting.plan_id,
        notes: `From the meeting "${seat.meeting.title}".`,
      },
      seat.spaceId,
    )
    if (res) added += 1
  }
  if (lines.length > 0 && added === 0) return fail('The to-dos could not be added.')
  if (added > 0) {
    await recordPlanActivity({
      ...(seat.meeting.plan_id ? { planId: seat.meeting.plan_id } : { entryId: seat.meeting.id }),
      actorProfileId: seat.profileId,
      actorSpaceId: seat.spaceId,
      kind: 'todo_added',
      summary: `Added ${added} ${added === 1 ? 'to-do' : 'to-dos'} from the meeting notes of "${seat.meeting.title}".`,
    })
  }
  return ok({ added })
}
