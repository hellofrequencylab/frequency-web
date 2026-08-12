import { describe, it, expect } from 'vitest'
import { circleTabs } from './tabs'

// The circle detail shell's ONE rule (PAGE-FRAMEWORK §3 + ADR-089's empty-Circle guardrail):
// a tab strip is a heavier surface, so a circle nobody has joined yet does not get one. These fail
// on the pre-shell tree for the plainest possible reason: there was no tabbed circle route at all,
// and no rule to ask.

const base = { slug: 'sunrise-sit', memberCount: 4, canManage: false }

describe('circleTabs', () => {
  it('offers Home, Members and Leaderboard, in that order, for a circle with people in it', () => {
    const tabs = circleTabs(base)
    expect(tabs.map((t) => t.label)).toEqual(['Home', 'Members', 'Leaderboard'])
    expect(tabs[0].href).toBe('/circles/sunrise-sit')
    expect(tabs[1].href).toBe('/circles/sunrise-sit/members')
    expect(tabs[2].href).toBe('/circles/sunrise-sit/leaderboard')
  })

  it('puts NO count on the Leaderboard tab: a number there would read as a standing', () => {
    expect(circleTabs(base)[2].count).toBeUndefined()
  })

  it('puts the roster size on the Members tab', () => {
    expect(circleTabs({ ...base, memberCount: 2 })[1].count).toBe(2)
  })

  it('shows tabs at TWO members, the size production actually has', () => {
    expect(circleTabs({ ...base, memberCount: 2 })).toHaveLength(3)
  })

  it('still offers the Leaderboard at TWO members, where it is the shared bar and an honest empty', () => {
    // The Leaderboard tab rides the strip's own threshold rather than a higher one of its own: it
    // leads with the Circle's SHARED total, which is real content at any size, and the page's
    // ~6-contributor gate decides whether a list of individuals appears beneath it.
    expect(circleTabs({ ...base, memberCount: 2 }).map((t) => t.label)).toContain('Leaderboard')
  })

  it('hides the strip entirely for a circle of one (ADR-089: defer the heavier surfaces)', () => {
    expect(circleTabs({ ...base, memberCount: 1 })).toEqual([])
    expect(circleTabs({ ...base, memberCount: 0 })).toEqual([])
  })

  it('still shows the strip to a MANAGER of a circle of one, who needs to find the roster', () => {
    expect(circleTabs({ ...base, memberCount: 1, canManage: true })).toHaveLength(3)
  })

  it('builds no tabs without a slug (fail-closed, so a bad route renders no broken links)', () => {
    expect(circleTabs({ ...base, slug: '' })).toEqual([])
  })

  it('offers no Chat tab: a tab pointing at nothing is worse than no tab', () => {
    const labels = circleTabs({ ...base, canManage: true }).map((t) => t.label)
    expect(labels).not.toContain('Chat')
  })
})
