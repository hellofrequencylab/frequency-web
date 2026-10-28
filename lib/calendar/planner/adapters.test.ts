import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from '../item'
import type { SpacePlan } from '../plans'
import type { CrmTask } from '@/lib/crm/tasks-core'
import { adaptCalendar, clockMinutes, plannerKindOf } from './adapters'
import { needsYou } from './needs-you'

const OWN = 'space-own'

function ev(over: Partial<CalendarEvent>): CalendarEvent {
  return {
    slug: 'e1',
    title: 'Supper club',
    dayKey: '2026-10-30',
    timeLabel: '7:00 PM',
    endTimeLabel: '9:30 PM',
    whenLabel: 'Fri, Oct 30, 7:00 PM PDT',
    startInstantIso: null,
    location: null,
    goingCount: 0,
    coverUrl: null,
    isCancelled: false,
    ...over,
  }
}

function plan(over: Partial<SpacePlan>): SpacePlan {
  return {
    id: 'p1',
    spaceId: OWN,
    title: 'Winter market',
    stage: 'plan',
    notes: null,
    links: [],
    files: [],
    targetKind: 'event',
    playbookId: null,
    ownerProfileId: 'u1',
    createdBy: 'u1',
    archivedAt: null,
    createdAt: '',
    updatedAt: '',
    ...over,
  }
}

function todo(over: Partial<CrmTask>): CrmTask {
  return {
    id: 't1',
    spaceId: OWN,
    contactId: null,
    assigneeProfileId: 'u1',
    title: 'Order mats',
    notes: null,
    dueAt: '2026-10-28T12:00:00Z',
    status: 'open',
    createdBy: null,
    createdAt: '',
    updatedAt: '',
    planId: null,
    dueOffsetDays: null,
    ...over,
  }
}

describe('clockMinutes', () => {
  it('reads the server clock labels', () => {
    expect(clockMinutes('7:00 PM')).toBe(19 * 60)
    expect(clockMinutes('9:30 AM')).toBe(9 * 60 + 30)
    expect(clockMinutes('12:00 AM')).toBe(0)
    expect(clockMinutes('12:15 PM')).toBe(12 * 60 + 15)
    expect(clockMinutes('7 pm')).toBe(19 * 60)
  })
  it('is null for all day and for junk', () => {
    expect(clockMinutes('All day')).toBeNull()
    expect(clockMinutes('To-do')).toBeNull()
    expect(clockMinutes('')).toBeNull()
    expect(clockMinutes(null)).toBeNull()
    expect(clockMinutes('13:00 PM')).toBeNull()
  })
})

describe('plannerKindOf', () => {
  it('prints Production for a draft and Event for a live event', () => {
    expect(plannerKindOf(ev({ layer: 'events', publicationState: 'published' }))).toBe('event')
    expect(plannerKindOf(ev({ layer: 'events', publicationState: 'unpublished', statusLabel: 'Draft' }))).toBe('production')
  })
  it('reads an entry by its stage and its layer', () => {
    expect(plannerKindOf(ev({ layer: 'pencil', stage: 'planning' }))).toBe('planning')
    expect(plannerKindOf(ev({ layer: 'pencil', stage: 'production' }))).toBe('production')
    expect(plannerKindOf(ev({ layer: 'pencil', stage: null }))).toBe('pencil')
    expect(plannerKindOf(ev({ layer: 'private' }))).toBe('private')
    expect(plannerKindOf(ev({ layer: 'unavailable' }))).toBe('unavailable')
  })
  it('lets cancelled win', () => {
    expect(plannerKindOf(ev({ layer: 'events', isCancelled: true }))).toBe('cancelled')
    expect(plannerKindOf(ev({ layer: 'pencil', stage: 'cancelled' }))).toBe('cancelled')
  })
})

describe('adaptCalendar', () => {
  it('turns a timed event into minutes and a length', () => {
    const { items } = adaptCalendar({ ownSpaceId: OWN, events: [ev({ layer: 'events' })], plans: [], todos: [] })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'event', date: '2026-10-30', startMin: 1140, durMin: 150, end: null })
    expect(items[0].eventHref).toBe('/events/e1')
  })
  it('gives an untimed or open-ended date an all-day band or an hour', () => {
    const { items } = adaptCalendar({
      ownSpaceId: OWN,
      events: [
        ev({ slug: 'a', layer: 'private', timeLabel: 'All day', endTimeLabel: null, dayKey: '2026-10-26', endDayKey: '2026-10-28' }),
        ev({ slug: 'b', layer: 'private', endTimeLabel: null }),
      ],
      plans: [],
      todos: [],
    })
    expect(items[0]).toMatchObject({ startMin: null, end: '2026-10-28' })
    expect(items[1]).toMatchObject({ startMin: 1140, durMin: 60 })
  })
  it('letters the dates of a pencil group in date order', () => {
    const { items } = adaptCalendar({
      ownSpaceId: OWN,
      events: [
        ev({ slug: 'b', layer: 'pencil', stage: 'pencil', optionGroup: 'g', dayKey: '2026-10-30' }),
        ev({ slug: 'a', layer: 'pencil', stage: 'pencil', optionGroup: 'g', dayKey: '2026-10-29' }),
        ev({ slug: 'c', layer: 'pencil', stage: 'pencil', optionGroup: null, dayKey: '2026-11-02' }),
      ],
      plans: [],
      todos: [],
    })
    expect(items.map((i) => [i.id, i.option])).toEqual([
      ['b:2026-10-30', 'B'],
      ['a:2026-10-29', 'A'],
      ['c:2026-11-02', null],
    ])
  })
  it('drops the to-do layer, which the task list already carries', () => {
    const { items } = adaptCalendar({
      ownSpaceId: OWN,
      events: [ev({ layer: 'todos', slug: 'todo-1' })],
      plans: [],
      todos: [todo({})],
    })
    expect(items).toHaveLength(0)
  })
  it('marks a co-hosted event shared', () => {
    const { items } = adaptCalendar({
      ownSpaceId: OWN,
      events: [ev({ layer: 'events', sourceLabel: 'Co-hosted here', publicationState: 'published' })],
      plans: [],
      todos: [],
    })
    expect(items[0].shared).toBe(true)
  })
  it('stages a Plan from its dates', () => {
    const out = adaptCalendar({
      ownSpaceId: OWN,
      events: [
        ev({ slug: 'x', layer: 'events', publicationState: 'published', planId: 'p1' }),
        ev({ slug: 'y', layer: 'events', isCancelled: true, planId: 'p2' }),
      ],
      plans: [plan({ id: 'p1', stage: 'production' }), plan({ id: 'p2', stage: 'plan' }), plan({ id: 'p3', stage: 'plan' })],
      todos: [],
    })
    expect(out.plans.map((p) => [p.id, p.stage])).toEqual([
      ['p1', 'event'],
      ['p2', 'cancelled'],
      ['p3', 'planning'],
    ])
    expect(out.plans[0].targetLabel).toBe('Event')
  })
  it('takes a pencil Plan hold from its earliest held date', () => {
    const held = (slug: string, until: string) =>
      ev({ slug, layer: 'pencil', stage: 'pencil', planId: 'p1', entryInput: { holdExpiresOn: until } as CalendarEvent['entryInput'] })
    const out = adaptCalendar({
      ownSpaceId: OWN,
      events: [held('a', '2026-11-02'), held('b', '2026-10-27')],
      plans: [plan({ id: 'p1', stage: 'pencil' })],
      todos: [],
    })
    expect(out.plans[0].hold).toBe('2026-10-27')
  })
  it('reads a to-do as a task with a phase', () => {
    const { tasks } = adaptCalendar({
      ownSpaceId: OWN,
      events: [],
      plans: [],
      todos: [todo({ dueOffsetDays: -3, planId: 'p1' }), todo({ id: 't2', dueAt: null, status: 'done' }), todo({ id: 't3', dueOffsetDays: 0 })],
    })
    expect(tasks[0]).toMatchObject({ due: '2026-10-28', phase: 'Before', done: false, plan: 'p1', owner: 'u1' })
    expect(tasks[1]).toMatchObject({ due: null, done: true, phase: null })
    expect(tasks[2].phase).toBe('Day of')
  })
  it('turns a pending offer into an invite Needs you can read', () => {
    const out = adaptCalendar({
      ownSpaceId: OWN,
      events: [],
      plans: [],
      todos: [],
      incoming: [
        { id: 's1', planId: 'px', status: 'pending', planTitle: 'Beach clean', hostSpaceId: 'swami', hostName: "Swami's Beach", createdAt: '' },
        { id: 's2', planId: 'py', status: 'declined', planTitle: 'Old', hostSpaceId: 'swami', hostName: "Swami's Beach", createdAt: '' },
      ],
    })
    expect(out.plans).toHaveLength(1)
    const list = needsYou(out, '2026-10-21', OWN, out.spaceNames)
    expect(list[0]).toMatchObject({ kind: 'invite', text: "Swami's Beach invited you to co-host", sub: 'Beach clean' })
  })
  it('keeps an accepted shared Plan with this Space as co-host', () => {
    const out = adaptCalendar({
      ownSpaceId: OWN,
      events: [],
      plans: [],
      todos: [],
      sharedPlans: [{ plan: plan({ id: 'ps', spaceId: 'host', title: 'Harvest table' }), hostName: 'Sunshine Vineyard' }],
    })
    expect(out.plans[0].spaces).toEqual([
      { id: 'host', role: 'Host', status: 'accepted' },
      { id: OWN, role: 'Co-host', status: 'accepted' },
    ])
    expect(out.spaceNames.host).toBe('Sunshine Vineyard')
  })
})
