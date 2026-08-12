import { describe, it, expect } from 'vitest'
import { circleTabs } from './tabs'

// The circle detail shell's ONE rule (PAGE-FRAMEWORK §3 + ADR-089's empty-Circle guardrail):
// a tab strip is a heavier surface, so a circle nobody has joined yet does not get one. These fail
// on the pre-shell tree for the plainest possible reason: there was no tabbed circle route at all,
// and no rule to ask.

const base = { slug: 'sunrise-sit', memberCount: 4, canManage: false }

describe('circleTabs', () => {
  it('offers Home and Members, in that order, for a circle with people in it', () => {
    const tabs = circleTabs(base)
    expect(tabs.map((t) => t.label)).toEqual(['Home', 'Members'])
    expect(tabs[0].href).toBe('/circles/sunrise-sit')
    expect(tabs[1].href).toBe('/circles/sunrise-sit/members')
  })

  it('puts the roster size on the Members tab', () => {
    expect(circleTabs({ ...base, memberCount: 2 })[1].count).toBe(2)
  })

  it('shows tabs at TWO members, the size production actually has', () => {
    expect(circleTabs({ ...base, memberCount: 2 })).toHaveLength(2)
  })

  it('hides the strip entirely for a circle of one (ADR-089: defer the heavier surfaces)', () => {
    expect(circleTabs({ ...base, memberCount: 1 })).toEqual([])
    expect(circleTabs({ ...base, memberCount: 0 })).toEqual([])
  })

  it('still shows the strip to a MANAGER of a circle of one, who needs to find the roster', () => {
    expect(circleTabs({ ...base, memberCount: 1, canManage: true })).toHaveLength(2)
  })

  it('builds no tabs without a slug (fail-closed, so a bad route renders no broken links)', () => {
    expect(circleTabs({ ...base, slug: '' })).toEqual([])
  })

  it('offers no Chat or Leaderboard tab: a tab pointing at nothing is worse than no tab', () => {
    const labels = circleTabs({ ...base, canManage: true }).map((t) => t.label)
    expect(labels).not.toContain('Chat')
    expect(labels).not.toContain('Leaderboard')
  })
})
