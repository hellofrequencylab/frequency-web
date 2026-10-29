import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from '../item'
import type { SpacePlan } from '../plans'
import type { PlanShareView } from '../plan-shares'
import { adaptCalendar, type AdaptedCalendar, type SuiteItem, type SuitePlan } from './adapters'
import { addInvited, answerInvite, cohostRows, dropInvited, hostsPlan, inviteChoices, sharedRollup } from './cohost'
import { isItemVisible } from './day-items'
import { needsYou } from './needs-you'
import { layerCounts } from './suite-model'

const OWN = 'space-own'
const HOST = 'space-host'
const VINE = 'space-vine'

function item(over: Partial<SuiteItem>): SuiteItem {
  return {
    id: 'i1',
    title: 'Beach clean',
    kind: 'event',
    date: '2026-10-20',
    end: null,
    startMin: 960,
    durMin: 120,
    plan: null,
    whenLabel: '',
    location: null,
    notes: null,
    eventHref: null,
    note: '',
    hostLabel: null,
    entryId: null,
    entryInput: null,
    occurrenceDate: null,
    ...over,
  }
}

function plan(over: Partial<SuitePlan>): SuitePlan {
  return {
    id: 'p1',
    title: 'Beach clean',
    stage: 'planning',
    target: 'Event',
    targetLabel: 'Event',
    owner: null,
    team: [],
    hold: null,
    spaces: [
      { id: HOST, role: 'Host', status: 'accepted' },
      { id: OWN, role: 'Co-host', status: 'pending', shareId: 'share-1' },
    ],
    notes: null,
    ...over,
  }
}

const DATA: AdaptedCalendar = {
  items: [item({ id: 'a', plan: 'p1' }), item({ id: 'b', plan: 'p2', title: 'Our own supper' }), item({ id: 'c', plan: null, title: 'Staff sync' })],
  tasks: [
    { id: 't1', title: 'Bring gloves', due: '2026-10-19', done: false, plan: 'p1', sharedFrom: 'Swami' },
    { id: 't2', title: 'Order mats', due: '2026-10-19', done: false, plan: 'p2', sharedFrom: null },
  ],
  plans: [plan({}), plan({ id: 'p2', title: 'Our own supper', spaces: [{ id: OWN, role: 'Host', status: 'accepted' }, { id: VINE, role: 'Co-host', status: 'accepted' }] })],
  spaceNames: { [HOST]: 'Swami', [VINE]: 'Vine' },
}

describe('answering an invite', () => {
  it('a yes marks this Space as co-hosting and changes nothing else', () => {
    const next = answerInvite(DATA, 'p1', OWN, 'accepted')
    expect(next.plans[0].spaces).toEqual([
      { id: HOST, role: 'Host', status: 'accepted' },
      { id: OWN, role: 'Co-host', status: 'accepted', shareId: 'share-1' },
    ])
    expect(next.items).toBe(DATA.items)
    expect(next.plans[1]).toBe(DATA.plans[1])
  })

  it('a no takes that Plan off this Space only: its dates and to-dos go, every other record stays', () => {
    const next = answerInvite(DATA, 'p1', OWN, 'declined')
    expect(next.plans.map((p) => p.id)).toEqual(['p2'])
    expect(next.items.map((i) => i.id)).toEqual(['b', 'c'])
    expect(next.tasks.map((t) => t.id)).toEqual(['t2'])
    // The Plan another Space hosts, and the Spaces on our own, are exactly as they were.
    expect(next.plans[0]).toBe(DATA.plans[1])
    expect(next.spaceNames).toBe(DATA.spaceNames)
  })

  it('never reaches into the records it was given', () => {
    const before = JSON.stringify(DATA)
    answerInvite(DATA, 'p1', OWN, 'declined')
    answerInvite(DATA, 'p1', OWN, 'accepted')
    expect(JSON.stringify(DATA)).toBe(before)
  })
})

describe('inviting and taking back', () => {
  it('adds the invited Space as pending and learns its name', () => {
    const next = addInvited(DATA, 'p2', { id: 'space-new', name: 'Ocean' }, 'share-9')
    expect(next.plans[1].spaces.at(-1)).toEqual({ id: 'space-new', role: 'Co-host', status: 'pending', shareId: 'share-9' })
    expect(next.spaceNames['space-new']).toBe('Ocean')
  })

  it('does not list a Space twice', () => {
    expect(addInvited(DATA, 'p2', { id: VINE, name: 'Vine' }, 'x').plans[1].spaces).toHaveLength(2)
  })

  it('taking back removes that Space and leaves the Plan', () => {
    const next = dropInvited(DATA, 'p2', VINE)
    expect(next.plans[1].spaces.map((s) => s.id)).toEqual([OWN])
    expect(next.plans).toHaveLength(2)
    expect(next.items).toBe(DATA.items)
  })
})

describe('the block in Details', () => {
  it('lists the host first, then the Spaces working it, then the invited', () => {
    const rows = cohostRows(
      plan({
        spaces: [
          { id: 'z', role: 'Co-host', status: 'pending' },
          { id: VINE, role: 'Co-host', status: 'accepted' },
          { id: OWN, role: 'Host', status: 'accepted' },
        ],
      }),
      OWN,
      'Ocean House',
      { [VINE]: 'Vine' },
    )
    expect(rows.map((r) => [r.name, r.label, r.you])).toEqual([
      ['Ocean House', 'Host', true],
      ['Vine', 'Co-host', false],
      ['Another Space', 'Invited', false],
    ])
  })

  it('offers only the collaborators not already on the Plan, by name', () => {
    const choices = inviteChoices(
      [
        { id: VINE, name: 'Vine' },
        { id: 'space-b', name: 'Beach' },
        { id: HOST, name: 'Swami' },
      ],
      DATA.plans[1],
    )
    expect(choices.map((c) => c.name)).toEqual(['Beach', 'Swami'])
  })

  it('only the Space that hosts may invite', () => {
    expect(hostsPlan(DATA.plans[0], OWN)).toBe(false)
    expect(hostsPlan(DATA.plans[1], OWN)).toBe(true)
  })
})

describe('Needs you for a pending invite', () => {
  it('names the host and carries the Plan the answer is for', () => {
    const [entry] = needsYou({ items: DATA.items, tasks: [], plans: DATA.plans }, '2026-10-21', OWN, DATA.spaceNames)
    expect(entry).toMatchObject({ kind: 'invite', text: 'Swami invited you to co-host', sub: 'Beach clean', action: 'Accept', ref: 'p1' })
  })

  it('is gone once the invite is answered either way', () => {
    for (const answer of ['accepted', 'declined'] as const) {
      const next = answerInvite(DATA, 'p1', OWN, answer)
      const entries = needsYou({ items: next.items, tasks: [], plans: next.plans }, '2026-10-21', OWN, next.spaceNames)
      expect(entries.some((e) => e.kind === 'invite')).toBe(false)
    }
  })
})

function ev(over: Partial<CalendarEvent>): CalendarEvent {
  return {
    slug: 'e1',
    title: 'Open mic',
    dayKey: '2026-10-28',
    timeLabel: '7:00 PM',
    endTimeLabel: '9:00 PM',
    whenLabel: 'Wed, Oct 28, 7:00 PM PDT',
    startInstantIso: null,
    location: 'The Barn',
    goingCount: 3,
    coverUrl: null,
    isCancelled: false,
    ...over,
  }
}

function spacePlan(over: Partial<SpacePlan>): SpacePlan {
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

function share(over: Partial<PlanShareView>): PlanShareView {
  return { id: 's1', planId: 'p1', guestSpaceId: VINE, status: 'pending', guestName: 'Vine', createdAt: '', respondedAt: null, ...over }
}

describe('the adapter, with co-hosting and the shared layer', () => {
  it('lists the Spaces this one invited on its own Plan: pending as Invited, accepted as Co-host', () => {
    const out = adaptCalendar({
      ownSpaceId: OWN,
      events: [],
      plans: [spacePlan({})],
      todos: [],
      hostShares: [share({}), share({ id: 's2', guestSpaceId: 'space-b', guestName: 'Beach', status: 'accepted' })],
    })
    const rows = cohostRows(out.plans[0], OWN, 'Ocean House', out.spaceNames)
    expect(rows.map((r) => [r.name, r.label])).toEqual([
      ['Ocean House', 'Host'],
      ['Beach', 'Co-host'],
      ['Vine', 'Invited'],
    ])
    expect(rows.find((r) => r.name === 'Vine')?.shareId).toBe('s1')
  })

  it('leaves a declined or taken-back share off the Plan', () => {
    const out = adaptCalendar({
      ownSpaceId: OWN,
      events: [],
      plans: [spacePlan({})],
      todos: [],
      hostShares: [share({ status: 'declined' }), share({ id: 's3', status: 'revoked' })],
    })
    expect(out.plans[0].spaces).toHaveLength(1)
  })

  it('keeps the share id on an offer addressed to this Space, so the answer can name it', () => {
    const out = adaptCalendar({
      ownSpaceId: OWN,
      events: [],
      plans: [],
      todos: [],
      incoming: [{ id: 'share-77', planId: 'p9', status: 'pending', planTitle: 'Beach clean', hostSpaceId: HOST, hostName: 'Swami', createdAt: '' }],
    })
    expect(out.plans[0].spaces.find((s) => s.id === OWN)).toMatchObject({ status: 'pending', shareId: 'share-77' })
  })

  it('draws a collaborator\'s and a chapter\'s dates as read-only items from another Space', () => {
    const out = adaptCalendar({
      ownSpaceId: OWN,
      events: [],
      plans: [],
      todos: [],
      sharedSources: [
        { spaceId: VINE, name: 'Vine', via: 'collaborator', events: [ev({}), ev({ slug: 'gone', isCancelled: true })] },
        { spaceId: 'space-ch', name: 'Chapter One', via: 'network', events: [ev({ slug: 'e2', title: 'Chapter circle', timeLabel: 'All day', endTimeLabel: null })] },
      ],
    })
    expect(out.items.map((i) => [i.title, i.from?.via])).toEqual([
      ['Open mic', 'collaborator'],
      ['Chapter circle', 'network'],
    ])
    const [mic] = out.items
    expect(mic).toMatchObject({ entryId: null, entryInput: null, plan: null, startMin: 1140, durMin: 120, hostLabel: 'Vine', eventHref: '/events/e1' })
    expect(out.spaceNames).toMatchObject({ [VINE]: 'Vine', 'space-ch': 'Chapter One' })
  })

  it('draws a date this Space also owns once, and a date two sources both carry once', () => {
    const out = adaptCalendar({
      ownSpaceId: OWN,
      events: [ev({})],
      plans: [],
      todos: [],
      sharedSources: [
        { spaceId: VINE, name: 'Vine', via: 'collaborator', events: [ev({}), ev({ slug: 'e3', title: 'Both' })] },
        { spaceId: VINE, name: 'Vine', via: 'network', events: [ev({ slug: 'e3', title: 'Both' })] },
      ],
    })
    expect(out.items.map((i) => i.title)).toEqual(['Open mic', 'Both'])
    expect(out.items[0].from).toBeUndefined()
  })
})

describe('the Shared with Spaces tile', () => {
  const foreign = item({ id: 'f1', from: { space: VINE, via: 'collaborator' }, shared: true })
  const chapter = item({ id: 'f2', from: { space: 'space-ch', via: 'network' }, shared: true, date: '2026-10-22' })
  const data = { items: [item({ id: 'own', plan: 'p2' }), foreign, chapter], tasks: [], plans: DATA.plans }

  it('is switched by the Shared tile alone, not the Events tile', () => {
    expect(isItemVisible({ ...data, hidden: { events: true } }, foreign, OWN)).toBe(true)
    expect(isItemVisible({ ...data, hidden: { shared: true } }, foreign, OWN)).toBe(false)
    expect(isItemVisible({ ...data, hidden: { shared: true } }, data.items[0], OWN)).toBe(false)
  })

  it('counts another Space\'s dates under Shared only, and an own shared Plan under both', () => {
    const counts = layerCounts(data, '2026-10', OWN)
    expect(counts.shared).toBe(3)
    expect(counts.events).toBe(1)
  })

  it('rolls the month up by where each date came from', () => {
    const rows = sharedRollup(data.items, data.plans, { ...DATA.spaceNames, 'space-ch': 'Chapter One' }, OWN, '2026-10')
    expect(rows).toEqual([
      { tier: 'partner', count: 1, spaces: ['Vine'] },
      { tier: 'collaborator', count: 1, spaces: ['Vine'] },
      { tier: 'network', count: 1, spaces: ['Chapter One'] },
    ])
    expect(sharedRollup(data.items, data.plans, {}, OWN, '2027-01')).toEqual([])
  })
})
