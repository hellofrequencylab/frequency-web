import { describe, it, expect } from 'vitest'
import { pageRailPanels } from './rail-panels'

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

  it('falls back to a full, content-aware default for unmapped routes (never bare)', () => {
    const dflt = ['pulse', 'activenow', 'newcircles', 'events']
    expect(pageRailPanels('/some/new/section')).toEqual(dflt)
    expect(pageRailPanels('/settings')).toEqual(dflt)
    // the default leads with panels that effectively always render (pulse) or self-fall-back
    expect(pageRailPanels('/anything')[0]).toBe('pulse')
  })
})
