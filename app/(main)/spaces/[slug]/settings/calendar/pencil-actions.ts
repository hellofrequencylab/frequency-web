'use server'

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { parseEntryInput } from '@/lib/calendar/entries'
import { insertCalendarEntries } from '@/lib/calendar/entries-store'
import { parsePlanInput } from '@/lib/calendar/plans'
import { archiveSpacePlanRows, insertSpacePlan, setPlanHoldRow } from '@/lib/calendar/plans-store'
import { recordPlanActivity } from '@/lib/calendar/plan-activity-store'
import { addDays } from '@/lib/calendar/planner/days'
import { shortDateLabel } from '@/lib/calendar/short-date'
import { planPencilItIn, planQuickAdd, quickEntry } from '@/lib/calendar/planner/pencil-it-in'
import { createTask } from '@/lib/crm/tasks'
import { log } from '@/lib/log'
import { dayInZone, resolveZone } from '@/lib/time/zone'

// PENCIL IT IN AND QUICK ADD: the two writes the new sheets make that no existing action makes in one
// step. Pencil it in starts a Plan, holds up to three dates on it, sets the hold and adds a playbook's
// to-dos, all through the same rows the Plan drawer writes. Quick add makes one private or unavailable
// date or one to-do and hands its id back so the toast can offer Undo. Each is gated like the actions
// beside it: an editor of this Space with the Calendar function on. All the reading of the input lives
// in lib/calendar/planner/pencil-it-in.ts.

async function resolveEditor(slug: string): Promise<{ spaceId: string; profileId: string; zone: string } | null> {
  if (typeof slug !== 'string') return null
  const caller = await getCallerProfile()
  if (!caller?.id) return null
  const space = await getVisibleSpaceBySlug(slug, caller.id)
  if (!space) return null
  const caps = await getSpaceCapabilities(space, caller.id)
  if (!caps.canEditProfile || !spaceFunctionAccess(space, 'events', caps.role)) return null
  return { spaceId: space.id, profileId: caller.id, zone: resolveZone(space.timeZone) }
}

function revalidate(slug: string) {
  revalidatePath(`/spaces/${slug}/settings/calendar`)
  revalidatePath(`/spaces/${slug}/calendar`)
}

/**
 * Hold up to three dates on a new Plan. The Plan is made first, then its dates; if the dates cannot
 * be written the Plan is put away again so nothing half-made is left on the calendar. The hold day
 * and the playbook's to-dos come last, and a to-do that cannot be saved is told to the person rather
 * than swallowed (the Plan and its dates are kept: they are what the person asked for).
 */
export async function pencilItIn(slug: string, rawInput: unknown): Promise<ActionResult<{ planId: string; todos: number; holdUntil: string | null }>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this calendar.')
  const today = dayInZone(new Date(), editor.zone)
  const input = rawInput && typeof rawInput === 'object' ? { ...(rawInput as Record<string, unknown>), timeZone: editor.zone } : null
  const planned = planPencilItIn(input, today)
  if ('error' in planned) return fail(planned.error)
  const p = planned.data

  const parsedPlan = parsePlanInput({ title: p.title, stage: 'pencil', targetKind: 'event' })
  if ('error' in parsedPlan) return fail(parsedPlan.error)
  const plan = await insertSpacePlan(editor.spaceId, parsedPlan.data, editor.profileId)
  if ('error' in plan) return fail(plan.error)
  const planId = plan.data.id

  const writes = []
  for (const input of p.entries(planId)) {
    const parsed = parseEntryInput(input)
    if ('error' in parsed) {
      await archiveSpacePlanRows(editor.spaceId, planId)
      return fail(parsed.error)
    }
    writes.push(parsed.data)
  }
  const dates = await insertCalendarEntries(editor.spaceId, writes, editor.profileId)
  if ('error' in dates) {
    await archiveSpacePlanRows(editor.spaceId, planId)
    return fail('The dates could not be held. Nothing was saved.')
  }

  if (p.holdUntil) {
    const held = await setPlanHoldRow(editor.spaceId, planId, p.holdUntil)
    if ('error' in held) log.error('calendar.pencil.hold_failed', { plan_id: planId })
  }
  await recordPlanActivity({
    planId,
    actorProfileId: editor.profileId,
    actorSpaceId: editor.spaceId,
    kind: 'field',
    summary: `Pencilled ${p.dates.length === 1 ? '1 date' : `${p.dates.length} dates`}${p.holdUntil ? `, holding until ${shortDateLabel(p.holdUntil)}` : ''}.`,
  })

  let added = 0
  for (const t of p.todos) {
    const made = await createTask(
      {
        createdBy: editor.profileId,
        title: t.title,
        dueAt: t.dueAt,
        planId,
        dueOffsetDays: t.dueOffsetDays,
        phase: t.phase,
        estMinutes: t.estMinutes,
      },
      editor.spaceId,
    )
    if (made) added += 1
  }
  if (added > 0 && p.playbookName) {
    await recordPlanActivity({
      planId,
      actorProfileId: editor.profileId,
      actorSpaceId: editor.spaceId,
      kind: 'todo_added',
      summary: `Added ${added} to-dos from the ${p.playbookName} playbook.`,
    })
  }
  revalidate(slug)
  if (added < p.todos.length) {
    return fail(`Your dates are held, but only ${added} of ${p.todos.length} playbook to-dos were saved. Open the Plan to add the rest.`)
  }
  return ok({ planId, todos: added, holdUntil: p.holdUntil })
}

/** What a quick add made, so Undo can take exactly it back. */
type QuickMade = { kind: 'plan'; id: string } | { kind: 'entry'; id: string } | { kind: 'todo'; id: string }

/**
 * Add one thing from a day, a time, or the command bar. A Pencil starts its own Plan (through
 * `pencilItIn`, with no playbook and a week's hold when the day is not tomorrow or sooner); a private
 * or unavailable date is one entry; a to-do is one crm task, undated when no day was said.
 */
export async function addQuickItem(slug: string, rawInput: unknown): Promise<ActionResult<QuickMade & { line: string }>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this calendar.')
  const today = dayInZone(new Date(), editor.zone)
  const planned = planQuickAdd(rawInput)
  if ('error' in planned) return fail(planned.error)
  const q = planned.data

  if (q.kind === 'pencil' && q.day) {
    // Tomorrow or sooner leaves no time to hold; anything later holds for a week.
    const holdDays = q.day > addDays(today, 1) ? 7 : 0
    const made = await pencilItIn(slug, { title: q.title, dates: [q.day], startMin: q.startMin, durMin: q.durMin, holdDays, playbookId: '' })
    if ('error' in made) return made
    return ok({ kind: 'plan', id: made.data.planId, line: 'Pencil added.' })
  }
  if (q.kind === 'todo') {
    const made = await createTask(
      {
        createdBy: editor.profileId,
        title: q.title,
        dueAt: q.day ? `${q.day}T12:00:00.000Z` : null,
        startMinute: q.day ? q.startMin : null,
      },
      editor.spaceId,
    )
    if (!made) return fail('That to-do could not be saved.')
    revalidate(slug)
    return ok({ kind: 'todo', id: made.id, line: q.day ? 'To-do added.' : 'To-do added to your inbox.' })
  }
  const parsed = parseEntryInput(quickEntry(q, editor.zone))
  if ('error' in parsed) return fail(parsed.error)
  const saved = await insertCalendarEntries(editor.spaceId, [parsed.data], editor.profileId)
  if ('error' in saved) return fail(saved.error)
  revalidate(slug)
  return ok({ kind: 'entry', id: saved.data[0].id, line: q.kind === 'private' ? 'Private time added.' : 'Marked unavailable.' })
}

