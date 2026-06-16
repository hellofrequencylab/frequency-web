import { describe, it, expect } from 'vitest'
import { pageRailPanels, isQuestSurface } from './rail-panels'

describe('pageRailPanels', () => {
  it('maps a matched section to its rule (first match wins)', () => {
    expect(pageRailPanels('/events')).toEqual(['events', 'online', 'circles'])
    expect(pageRailPanels('/circles/abc')).toEqual(['circles', 'newcircles', 'activenow', 'events'])
    expect(pageRailPanels('/crew/leaderboard')).toEqual(['leaderboard', 'online'])
  })

  it('gives the Leadership section its own leader-flavored panels', () => {
    expect(pageRailPanels('/lead')).toEqual(['pulse', 'leaderboard', 'activenow', 'events'])
    expect(pageRailPanels('/lead/crew-tasks')).toEqual(['pulse', 'leaderboard', 'activenow', 'events'])
  })

  it('lets a vertical own its routes via the registry (marketplace), before the base map (ADR-278)', () => {
    // /market now resolves from the marketplace descriptor's `rail`, not a hardcoded base rule.
    expect(pageRailPanels('/market')).toEqual(['online', 'circles', 'events'])
    expect(pageRailPanels('/market/listing/abc')).toEqual(['online', 'circles', 'events'])
    // sibling people-led routes still resolve from the base map
    expect(pageRailPanels('/channels')).toEqual(['online', 'circles', 'events'])
    expect(pageRailPanels('/people/jane')).toEqual(['online', 'circles', 'events'])
  })

  it('flags The Quest surfaces so the rail suppresses its duplicated standing panels', () => {
    // The /crew tree owns the member's standing (hub StandingHero/SeasonMap + Journey pages),
    // so the rail drops its ControlCenterPanel + GameStatsDock there (no duplicated standing).
    expect(isQuestSurface('/crew')).toBe(true)
    expect(isQuestSurface('/crew/journey')).toBe(true)
    expect(isQuestSurface('/crew/leaderboard')).toBe(true)
    expect(isQuestSurface('/crew/streaks')).toBe(true)
    expect(isQuestSurface('/crew/store')).toBe(true)
    // Off-Quest: the page shows no standing, so the rail KEEPS it (valuable there).
    expect(isQuestSurface('/feed')).toBe(false)
    expect(isQuestSurface('/channels')).toBe(false)
    expect(isQuestSurface('/people/jane')).toBe(false)
    expect(isQuestSurface('/crewmates')).toBe(false) // not a /crew sub-path
  })

  it('falls back to a full, content-aware default for unmapped routes (never bare)', () => {
    const dflt = ['pulse', 'activenow', 'newcircles', 'events']
    expect(pageRailPanels('/some/new/section')).toEqual(dflt)
    expect(pageRailPanels('/settings')).toEqual(dflt)
    // the default leads with panels that effectively always render (pulse) or self-fall-back
    expect(pageRailPanels('/anything')[0]).toBe('pulse')
  })
})
