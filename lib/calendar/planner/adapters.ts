import type { CalendarEvent } from '../item'
import type { EntryInput } from '../entries'
import { isActiveShare, type IncomingPlanShare, type PlanShareView, type SharedPlanView } from '../plan-shares'
import { planTargetDef, type SpacePlan } from '../plans'
import type { CrmTask } from '@/lib/crm/tasks-core'
import { phaseOfOffset } from './playbook-schedule'
import type { PlanStage, PlannerItem, PlannerKind, PlannerPlan, PlannerTask } from './types'

// THE ADAPTERS: the rows the Calendar page already loads (CalendarEvent, SpacePlan, CrmTask and the
// share rows) as the planner engine's records (./types.ts). Pure, so a test freezes nothing but its
// input. Nothing here writes, and nothing here invents a field the database does not hold: an item
// has no owner because a calendar row has none, and a Plan has no team because none is stored yet
// (the data pass adds both). What the views cannot read stays absent rather than guessed.

/** The label the admin loader gives an event another Space hosts and this Space co-hosts. */
const CO_HOSTED_LABEL = 'Co-hosted here'

/** An item as the shell draws it: the engine's record plus what only the Details panel prints. */
export interface SuiteItem extends PlannerItem {
  /** The when-line the server formatted in the item's own zone. */
  whenLabel: string
  location: string | null
  notes: string | null
  /** The guest-facing event page, for an event that is live. */
  eventHref: string | null
  /** "Draft", "Past", "Lapses Oct 27" or empty. */
  note: string
  /** The Space that hosts it, when this Space co-hosts. */
  hostLabel: string | null
  /** The stored date this item draws, when it is a Pencil, a private entry or an unavailable span:
   *  the one a drag writes through saveCalendarEntry. Null for a published event. */
  entryId: string | null
  /** That entry as the drawer edits it (the MASTER's, on a repeating entry). */
  entryInput: EntryInput | null
  /** The day this item stands on when it is one occurrence of a repeating entry. */
  occurrenceDate: string | null
}

export interface SuiteTask extends PlannerTask {
  /** The host Space's name when the to-do belongs to a Plan another Space shared with this one. */
  sharedFrom: string | null
}

export interface SuitePlan extends PlannerPlan {
  /** "Event", "Program", "Maintenance". */
  targetLabel: string
  /** The Plan's own notes, when it keeps any. */
  notes: string | null
}

export interface AdaptedCalendar {
  items: SuiteItem[]
  tasks: SuiteTask[]
  plans: SuitePlan[]
  /** Space id to name, for the invite line in Needs you. */
  spaceNames: Record<string, string>
}

interface AdapterInput {
  ownSpaceId: string
  events: readonly CalendarEvent[]
  plans: readonly SpacePlan[]
  todos: readonly CrmTask[]
  /** Offers other Spaces made this one, still waiting on an answer. */
  incoming?: readonly IncomingPlanShare[]
  /** Plans other Spaces shared with this one and this Space accepted. */
  sharedPlans?: readonly SharedPlanView[]
  /** The offers this Space made on its own Plans, in any state: the Spaces it invited to co-host. */
  hostShares?: readonly PlanShareView[]
  /** Other Spaces' public dates, for the Shared with Spaces tile: accepted collaborators first, then
   *  the Network's chapters. Read-only here. */
  sharedSources?: readonly SharedSource[]
}

/** One other Space's dates as the page read them, with how they reached this calendar. */
export interface SharedSource {
  spaceId: string
  name: string
  via: 'collaborator' | 'network'
  events: readonly CalendarEvent[]
}

/** "7 PM", "7:30 PM", "9:00 AM" to minutes since midnight. Null for "All day" or anything unreadable. */
export function clockMinutes(label: string | null | undefined): number | null {
  if (!label) return null
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\s*$/i.exec(label)
  if (!m) return null
  const h = Number(m[1])
  const min = m[2] ? Number(m[2]) : 0
  if (h < 1 || h > 12 || min > 59) return null
  return (h % 12) * 60 + (m[3].toLowerCase() === 'p' ? 12 * 60 : 0) + min
}

/** A date with no end time runs an hour, the same default the Day and Week grids give it. */
const DEFAULT_LENGTH_MIN = 60

const STAGE_KIND: Record<string, PlannerKind> = { pencil: 'pencil', planning: 'planning', production: 'production' }

/** Which kind of chip a row of the admin calendar is, by the owner's rulings: the stages are Pencil,
 *  Planning and Production, a draft event is still a Production, and a published one is an Event. */
export function plannerKindOf(ev: CalendarEvent): PlannerKind {
  if (ev.isCancelled || ev.stage === 'cancelled') return 'cancelled'
  const layer = ev.layer ?? 'events'
  if (layer === 'private') return 'private'
  if (layer === 'unavailable') return 'unavailable'
  if (layer === 'pencil') return STAGE_KIND[ev.stage ?? ''] ?? 'pencil'
  if (STAGE_KIND[ev.stage ?? '']) return STAGE_KIND[ev.stage ?? '']
  if (ev.publicationState === 'unpublished' || ev.statusLabel === 'Draft') return 'production'
  return 'event'
}

function planStageOf(plan: SpacePlan, own: readonly PlannerItem[]): PlanStage {
  const live = own.filter((i) => i.kind !== 'cancelled')
  if (own.length > 0 && live.length === 0) return 'cancelled'
  if (plan.stage === 'production' && live.length > 0 && live.every((i) => i.kind === 'event')) return 'event'
  if (plan.stage === 'plan') return 'planning'
  return plan.stage
}

/** Everything the planner engine reads, from what the Calendar page loads. */
export function adaptCalendar(input: AdapterInput): AdaptedCalendar {
  const { ownSpaceId } = input

  // Option letters: the dates of one pencil group, in date order, are A, B and C.
  const groups = new Map<string, CalendarEvent[]>()
  for (const ev of input.events) {
    if (ev.layer === 'todos' || !ev.optionGroup || plannerKindOf(ev) !== 'pencil') continue
    groups.set(ev.optionGroup, [...(groups.get(ev.optionGroup) ?? []), ev])
  }
  const optionOf = new Map<CalendarEvent, string>()
  for (const list of groups.values()) {
    if (list.length < 2) continue
    list
      .slice()
      .sort((a, b) => (a.dayKey < b.dayKey ? -1 : a.dayKey > b.dayKey ? 1 : 0))
      .forEach((ev, i) => optionOf.set(ev, String.fromCharCode(65 + i)))
  }

  const items: SuiteItem[] = []
  const holdByPlan = new Map<string, string>()
  for (const ev of input.events) {
    // A to-do due date is a task, and the tasks come in on their own below.
    if (ev.layer === 'todos') continue
    const kind = plannerKindOf(ev)
    const start = clockMinutes(ev.timeLabel)
    const end = start == null ? null : clockMinutes(ev.endTimeLabel)
    const multi = !!ev.endDayKey && ev.endDayKey > ev.dayKey
    const hold = ev.entryInput?.holdExpiresOn || null
    if (kind === 'pencil' && ev.planId && hold) {
      const seen = holdByPlan.get(ev.planId)
      if (!seen || hold < seen) holdByPlan.set(ev.planId, hold)
    }
    items.push({
      id: `${ev.slug}:${ev.dayKey}`,
      title: ev.title,
      kind,
      date: ev.dayKey,
      end: multi ? ev.endDayKey : null,
      startMin: start,
      durMin: start != null && end != null && end > start ? end - start : DEFAULT_LENGTH_MIN,
      plan: ev.planId ?? null,
      owner: null,
      option: optionOf.get(ev) ?? null,
      series: !!ev.seriesKey,
      going: ev.goingCount || 0,
      shared: ev.sourceLabel === CO_HOSTED_LABEL,
      whenLabel: ev.whenLabel,
      location: ev.location,
      notes: ev.notes ?? null,
      eventHref: kind === 'event' && (ev.layer ?? 'events') === 'events' ? `/events/${ev.slug}` : null,
      note: ev.statusLabel ?? '',
      hostLabel: ev.sourceLabel === CO_HOSTED_LABEL ? 'Another Space' : null,
      entryId: ev.entryId ?? null,
      entryInput: ev.entryId ? (ev.entryInput ?? null) : null,
      occurrenceDate: ev.occurrenceDate ?? null,
    })
  }

  const own = (planId: string) => items.filter((i) => i.plan === planId)
  const spaceNames: Record<string, string> = {}

  // The Spaces this one invited, on the Plans it hosts. A pending offer shows as Invited, an accepted
  // one as Co-host; a declined or taken-back share is history and leaves the Plan's Spaces alone.
  const invitedOn = new Map<string, PlanSpaceRefOut[]>()
  for (const share of input.hostShares ?? []) {
    if (!isActiveShare(share.status)) continue
    if (share.guestName) spaceNames[share.guestSpaceId] = share.guestName
    invitedOn.set(share.planId, [
      ...(invitedOn.get(share.planId) ?? []),
      { id: share.guestSpaceId, role: 'Co-host', status: share.status === 'accepted' ? 'accepted' : 'pending', shareId: share.id },
    ])
  }

  const plans: SuitePlan[] = input.plans.map((p) => ({
    id: p.id,
    title: p.title,
    stage: planStageOf(p, own(p.id)),
    target: planTargetDef(p.targetKind).label,
    targetLabel: planTargetDef(p.targetKind).label,
    owner: p.ownerProfileId,
    team: p.ownerProfileId ? [p.ownerProfileId] : [],
    hold: holdByPlan.get(p.id) ?? null,
    spaces: [{ id: ownSpaceId, role: 'Host', status: 'accepted' }, ...(invitedOn.get(p.id) ?? [])],
    notes: p.notes,
  }))

  for (const offer of input.incoming ?? []) {
    if (offer.status !== 'pending' || !offer.hostSpaceId) continue
    if (offer.hostName) spaceNames[offer.hostSpaceId] = offer.hostName
    plans.push({
      id: offer.planId,
      title: offer.planTitle ?? 'A shared Plan',
      stage: 'pencil',
      target: 'Event',
      targetLabel: 'Event',
      owner: null,
      team: [],
      hold: null,
      spaces: [
        { id: offer.hostSpaceId, role: 'Host', status: 'accepted' },
        { id: ownSpaceId, role: 'Co-host', status: 'pending', shareId: offer.id },
      ],
      notes: null,
    })
  }
  for (const view of input.sharedPlans ?? []) {
    if (plans.some((p) => p.id === view.plan.id)) continue
    if (view.hostName) spaceNames[view.plan.spaceId] = view.hostName
    plans.push({
      id: view.plan.id,
      title: view.plan.title,
      stage: planStageOf(view.plan, own(view.plan.id)),
      target: planTargetDef(view.plan.targetKind).label,
      targetLabel: planTargetDef(view.plan.targetKind).label,
      owner: null,
      team: [],
      hold: null,
      spaces: [
        { id: view.plan.spaceId, role: 'Host', status: 'accepted' },
        { id: ownSpaceId, role: 'Co-host', status: 'accepted' },
      ],
      notes: view.plan.notes,
    })
  }

  // A date another Space hosts reads "Hosted by {that Space}" once the Plan it belongs to names the host.
  for (const item of items) {
    if (!item.hostLabel || !item.plan) continue
    const host = plans.find((p) => p.id === item.plan)?.spaces.find((s) => s.role === 'Host')
    if (host && host.id !== ownSpaceId && spaceNames[host.id]) item.hostLabel = spaceNames[host.id]
  }

  const tasks: SuiteTask[] = input.todos.map((t) => ({
    id: t.id,
    title: t.title,
    due: t.dueAt ? t.dueAt.slice(0, 10) : null,
    startMin: t.startMinute ?? null,
    estHours: t.estMinutes == null ? null : t.estMinutes / 60,
    plan: t.planId,
    owner: t.assigneeProfileId,
    phase: t.dueOffsetDays == null ? null : phaseOfOffset(t.dueOffsetDays),
    dueOffsetDays: t.dueOffsetDays,
    done: t.status === 'done',
    sharedFrom: t.sharedFrom ?? null,
  }))

  // Other Spaces' dates: one chip per date, this Space's own copy of it wins, and a date two sources
  // both carry is drawn once under the first.
  const seen = new Set(items.map((i) => i.id))
  for (const source of input.sharedSources ?? []) {
    spaceNames[source.spaceId] = source.name
    for (const ev of source.events) {
      const item = foreignItem(ev, source)
      if (!item || seen.has(item.id) || seen.has(`${ev.slug}:${ev.dayKey}`)) continue
      seen.add(item.id)
      items.push(item)
    }
  }

  return { items, tasks, plans, spaceNames }
}

type PlanSpaceRefOut = SuitePlan['spaces'][number]

/** A date on another Space's calendar, as a read-only item: no Plan of ours, no stored entry, nothing
 *  to drag. A cancelled date stays off, because it is not a date anyone will arrive for. */
function foreignItem(ev: CalendarEvent, source: SharedSource): SuiteItem | null {
  if (ev.isCancelled || ev.layer === 'todos') return null
  const start = clockMinutes(ev.timeLabel)
  const end = start == null ? null : clockMinutes(ev.endTimeLabel)
  const multi = !!ev.endDayKey && ev.endDayKey > ev.dayKey
  return {
    id: `shared:${source.spaceId}:${ev.slug}:${ev.dayKey}`,
    title: ev.title,
    kind: 'event',
    date: ev.dayKey,
    end: multi ? ev.endDayKey : null,
    startMin: start,
    durMin: start != null && end != null && end > start ? end - start : DEFAULT_LENGTH_MIN,
    plan: null,
    owner: null,
    option: null,
    series: false,
    going: ev.goingCount || 0,
    shared: true,
    from: { space: source.spaceId, via: source.via },
    whenLabel: ev.whenLabel,
    location: ev.location,
    notes: null,
    eventHref: `/events/${ev.slug}`,
    note: '',
    hostLabel: source.name,
    entryId: null,
    entryInput: null,
    occurrenceDate: null,
  }
}
