import { describe, it, expect } from 'vitest'
import { circleTabs, type CircleTabFacts } from './tabs'

// The circle detail shell's tab rules (PAGE-FRAMEWORK §3, the owner's 2026-08-12 ruling, and
// ADR-089's empty-Circle guardrail underneath both). Five tabs, each hiding when it has nothing:
//
//   Feed · Events · Journey · Practice · Members
//
// These are the rules a render cannot check for you — "does a circle with no Journey running show a
// Journey tab" is a question about a pure function, and it is asked here so nobody has to boot a
// database to answer it.

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

/** Everything on at once. */
const busy: CircleTabFacts = {
  ...base,
  upcomingEventCount: 3,
  hasActiveJourney: true,
  hasAssignedPractice: true,
}

const labels = (facts: CircleTabFacts) => circleTabs(facts).map((t) => t.label)
const hrefs = (facts: CircleTabFacts) => circleTabs(facts).map((t) => t.href)

describe('circleTabs — the full strip', () => {
  it('offers Feed, Events, Journey, Practice and Members, in that order', () => {
    expect(labels(busy)).toEqual(['Feed', 'Events', 'Journey', 'Practice', 'Members'])
  })

  it('routes every tab under the circle, with Feed on the bare slug', () => {
    expect(hrefs(busy)).toEqual([
      '/circles/sunrise-sit',
      '/circles/sunrise-sit/events',
      '/circles/sunrise-sit/journey',
      '/circles/sunrise-sit/practice',
      '/circles/sunrise-sit/members',
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
})

describe('circleTabs — Events hides when nothing is booked', () => {
  it('hides Events on a circle with an empty calendar', () => {
    expect(labels(base)).not.toContain('Events')
  })

  it('shows Events as soon as one gathering is on the books', () => {
    expect(labels({ ...base, upcomingEventCount: 1 })).toContain('Events')
  })

  it('puts the count on the tab, so a visitor knows whether the click is worth it', () => {
    const events = circleTabs({ ...base, upcomingEventCount: 3 }).find((t) => t.label === 'Events')
    expect(events?.count).toBe(3)
  })

  it('stays hidden for a manager too: an empty calendar is empty for everyone', () => {
    // The owner's rule is about the CIRCLE having something, not about who is looking. A host with
    // nothing booked still meets the "create an event" prompt on the Feed tab.
    expect(labels({ ...base, canManage: true })).not.toContain('Events')
  })
})

describe('circleTabs — Journey hides unless a Run is going', () => {
  it('shows no Journey tab on a circle with no Journey running', () => {
    expect(labels(base)).not.toContain('Journey')
  })

  it('shows Journey once the circle is part-way through one together', () => {
    expect(labels({ ...base, hasActiveJourney: true })).toContain('Journey')
  })

  it('puts NO count on Journey: a number beside it would read as a score', () => {
    const journey = circleTabs({ ...base, hasActiveJourney: true }).find((t) => t.label === 'Journey')
    expect(journey?.count).toBeUndefined()
  })

  it('stays hidden for a manager with no Run: starting one is an admin-rail act, not a tab', () => {
    expect(labels({ ...base, canManage: true, hasActiveJourney: false })).not.toContain('Journey')
  })
})

describe('circleTabs — Practice, which absorbed the leaderboard', () => {
  it('offers no Leaderboard tab: the board is a reading of your practice, not a peer of it', () => {
    expect(labels(busy)).not.toContain('Leaderboard')
    expect(hrefs(busy).some((h) => h.includes('leaderboard'))).toBe(false)
  })

  it('shows Practice to a visitor once the circle has a practice assigned', () => {
    expect(labels({ ...base, hasAssignedPractice: true })).toContain('Practice')
  })

  it('hides Practice from a visitor when the circle has none', () => {
    expect(labels(base)).not.toContain('Practice')
  })

  it('shows Practice to a MEMBER even with none assigned: their own week is the content', () => {
    // The board scores a member against their own last few weeks, so it says something real at
    // any circle size and needs nobody else to be there.
    expect(labels({ ...base, isMember: true })).toContain('Practice')
  })

  it('shows Practice to a MANAGER with none assigned, because setting one lands there', () => {
    expect(labels({ ...base, canManage: true })).toContain('Practice')
  })
})

describe('circleTabs — Members', () => {
  it('shows the roster once there is more than one person on it', () => {
    expect(labels({ ...base, memberCount: 2 })).toContain('Members')
  })

  it('carries the roster size, which is the affordance', () => {
    const members = circleTabs({ ...base, memberCount: 2 }).find((t) => t.label === 'Members')
    expect(members?.count).toBe(2)
  })

  it('hides the roster on a circle of one: that is just the host', () => {
    expect(labels({ ...base, memberCount: 1 })).not.toContain('Members')
  })

  it('still shows it to a MANAGER of a circle of one, who needs to find the roster', () => {
    expect(labels({ ...base, memberCount: 1, canManage: true })).toContain('Members')
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
    expect(labels({ ...base, memberCount: 1, upcomingEventCount: 2 })).toEqual(['Feed', 'Events'])
    expect(labels({ ...base, memberCount: 1, hasActiveJourney: true })).toEqual(['Feed', 'Journey'])
    expect(labels({ ...base, memberCount: 1, hasAssignedPractice: true })).toEqual(['Feed', 'Practice'])
  })

  it('gives a MANAGER the strip at any size, because an empty state is their to-do', () => {
    expect(labels({ ...base, memberCount: 1, canManage: true })).toEqual(['Feed', 'Practice', 'Members'])
  })

  it('gives a circle of two the strip it has always had', () => {
    expect(labels({ ...base, memberCount: 2 })).toEqual(['Feed', 'Members'])
  })
})
