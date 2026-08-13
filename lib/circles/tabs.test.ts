import { describe, it, expect } from 'vitest'
import { circleTabs, type CircleTabFacts } from './tabs'

// The circle detail shell's tab rules (PAGE-FRAMEWORK §3, the owner's 2026-08-13 ruling, and
// ADR-089's empty-Circle guardrail underneath both). Four tabs, each hiding when it has nothing:
//
//   Feed · Program · Members · Circle Stats
//
// These are the rules a render cannot check for you — "does a circle with nothing scheduled show a
// Program tab" is a question about a pure function, and it is asked here so nobody has to boot a
// database to answer it.
//
// ⚠️ THIS FILE REPLACES THE FIVE-TAB SUITE OF 2026-08-12 (Feed · Events · Journey · Practice ·
// Members). Those three middle tabs were three doors onto one question — what is this Circle doing
// — so they merged into Program, and the board that hid under Practice moved out to its own tab
// with the momentum tiles. The old suite asserted each door separately; this one asserts the
// question, which is the thing that actually has to stay true.

/** A live-ish circle: four people, nothing else going on. */
const base: CircleTabFacts = {
  slug: 'sunrise-sit',
  memberCount: 4,
  canManage: false,
  isMember: false,
  upcomingEventCount: 0,
  hasActiveJourney: false,
  hasAssignedPractice: false,
}

/** Everything on at once, seen by someone on the roster. */
const busy: CircleTabFacts = {
  ...base,
  isMember: true,
  upcomingEventCount: 3,
  hasActiveJourney: true,
  hasAssignedPractice: true,
}

const labels = (facts: CircleTabFacts) => circleTabs(facts).map((t) => t.label)
const hrefs = (facts: CircleTabFacts) => circleTabs(facts).map((t) => t.href)
const tab = (facts: CircleTabFacts, label: string) => circleTabs(facts).find((t) => t.label === label)

describe('circleTabs — the full strip', () => {
  it('offers Feed, Program, Members and Circle Stats, in that order', () => {
    expect(labels(busy)).toEqual(['Feed', 'Program', 'Members', 'Circle Stats'])
  })

  it('routes every tab under the circle, with Feed on the bare slug', () => {
    expect(hrefs(busy)).toEqual([
      '/circles/sunrise-sit',
      '/circles/sunrise-sit/program',
      '/circles/sunrise-sit/members',
      '/circles/sunrise-sit/stats',
    ])
  })

  it('leads with Feed whenever a strip renders at all: it carries the reason people came', () => {
    expect(labels(busy)[0]).toBe('Feed')
    expect(labels({ ...base, memberCount: 9 })[0]).toBe('Feed')
    expect(labels({ ...base, memberCount: 1, upcomingEventCount: 1 })[0]).toBe('Feed')
  })

  it('builds no tabs without a slug (fail-closed, so a bad route renders no broken links)', () => {
    expect(circleTabs({ ...busy, slug: '' })).toEqual([])
  })

  it('offers none of the four tabs the merge retired', () => {
    // Each of these is still a live URL — a permanent redirect into Program or Circle Stats — but
    // none of them is a tab any more, and a strip that offered both would be two doors to one room.
    for (const gone of ['Events', 'Journey', 'Practice', 'Leaderboard']) {
      expect(labels(busy)).not.toContain(gone)
    }
    for (const segment of ['/events', '/journey', '/practice', '/leaderboard']) {
      expect(hrefs(busy).some((h) => h.endsWith(segment))).toBe(false)
    }
  })
})

describe('circleTabs — Program, which absorbed events, the practice and the Run', () => {
  it('shows Program to a VISITOR as soon as ANY of the three has something', () => {
    // Any one of them is enough. A Circle running only a Journey is not a Circle with two empty
    // tabs, which is exactly what the three-tab version made it look like.
    expect(labels({ ...base, upcomingEventCount: 1 })).toContain('Program')
    expect(labels({ ...base, hasActiveJourney: true })).toContain('Program')
    expect(labels({ ...base, hasAssignedPractice: true })).toContain('Program')
  })

  it('hides Program from a visitor when the circle has nothing on at all', () => {
    expect(labels(base)).not.toContain('Program')
  })

  it('shows Program to a MEMBER with nothing on: their own week is the content', () => {
    // The practice half scores a member against their own last few weeks, so it says something real
    // at any circle size and needs nobody else to be there.
    expect(labels({ ...base, isMember: true })).toContain('Program')
  })

  it('shows Program to a MANAGER with nothing on, because scheduling it lands there', () => {
    expect(labels({ ...base, canManage: true })).toContain('Program')
  })

  it('counts the upcoming events, and nothing else', () => {
    // 🔴 The count is EVENTS only. A practice is one thing and a Run is one thing, so folding them
    // in would make "5" a number with no referent — the reader cannot tell what five of what.
    expect(tab({ ...base, upcomingEventCount: 3 }, 'Program')?.count).toBe(3)
    expect(
      tab({ ...base, upcomingEventCount: 3, hasActiveJourney: true, hasAssignedPractice: true }, 'Program')
        ?.count,
    ).toBe(3)
  })

  it('carries NO count when the calendar is empty, rather than a zero', () => {
    // A "0" beside Program would say "nothing here" about a tab that still holds the practice and
    // the Run. Absent is the honest state.
    expect(tab({ ...base, isMember: true }, 'Program')?.count).toBeUndefined()
    expect(tab({ ...base, hasActiveJourney: true }, 'Program')?.count).toBeUndefined()
  })
})

describe('circleTabs — Members', () => {
  it('shows the roster once there is more than one person on it', () => {
    expect(labels({ ...base, memberCount: 2 })).toContain('Members')
  })

  it('carries the roster size, which is the affordance', () => {
    expect(tab({ ...base, memberCount: 2 }, 'Members')?.count).toBe(2)
  })

  it('hides the roster on a circle of one: that is just the host', () => {
    expect(labels({ ...base, memberCount: 1 })).not.toContain('Members')
  })

  it('still shows it to a MANAGER of a circle of one, who needs to find the roster', () => {
    expect(labels({ ...base, memberCount: 1, canManage: true })).toContain('Members')
  })
})

describe('circleTabs — Circle Stats is for the people in the room', () => {
  it('shows it to a member and to a manager', () => {
    expect(labels({ ...base, isMember: true })).toContain('Circle Stats')
    expect(labels({ ...base, canManage: true })).toContain('Circle Stats')
  })

  it('hides it from a visitor, however busy the circle is', () => {
    // 🔴 The one that matters. A stranger reading a Circle's weekly vital signs learns nothing they
    // can act on, and a thin week reads to them as a dead Circle when it is a new one.
    expect(labels(base)).not.toContain('Circle Stats')
    expect(labels({ ...base, ...busy, isMember: false, canManage: false })).not.toContain('Circle Stats')
  })

  it('carries no count: every number on that tab is a number, and one more would read as a rank', () => {
    expect(tab({ ...base, isMember: true }, 'Circle Stats')?.count).toBeUndefined()
  })

  it('goes LAST, because status is what you check after you know what is going on', () => {
    expect(labels(busy).at(-1)).toBe('Circle Stats')
  })
})

describe('circleTabs — ADR-089, no chrome on an empty room', () => {
  it('renders NO strip for a circle of one with nothing on and nothing running', () => {
    expect(circleTabs({ ...base, memberCount: 1 })).toEqual([])
    expect(circleTabs({ ...base, memberCount: 0 })).toEqual([])
  })

  it('never renders a lone Feed tab, which would only say "you are where you already are"', () => {
    // Every path that could produce one tab must produce none instead.
    for (const memberCount of [0, 1]) {
      expect(circleTabs({ ...base, memberCount })).toHaveLength(0)
    }
  })

  it('grows a strip the moment a circle of one has something to show', () => {
    expect(labels({ ...base, memberCount: 1, upcomingEventCount: 2 })).toEqual(['Feed', 'Program'])
    expect(labels({ ...base, memberCount: 1, hasActiveJourney: true })).toEqual(['Feed', 'Program'])
    expect(labels({ ...base, memberCount: 1, hasAssignedPractice: true })).toEqual(['Feed', 'Program'])
  })

  it('gives a MANAGER the strip at any size, because an empty state is their to-do', () => {
    expect(labels({ ...base, memberCount: 1, canManage: true })).toEqual([
      'Feed',
      'Program',
      'Members',
      'Circle Stats',
    ])
  })

  it('gives a circle of two the strip it has always had', () => {
    expect(labels({ ...base, memberCount: 2 })).toEqual(['Feed', 'Members'])
  })
})
