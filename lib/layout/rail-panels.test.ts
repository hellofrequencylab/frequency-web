import { describe, it, expect } from 'vitest'
import { pageRailPanels, isQuestSurface, spaceSlugFromPath } from './rail-panels'

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
    expect(pageRailPanels('/classifieds')).toEqual(['online', 'circles', 'events'])
    expect(pageRailPanels('/classifieds/listing/abc')).toEqual(['online', 'circles', 'events'])
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

  // ── THE SPACE RAIL (LIVE-518) ──────────────────────────────────────────────
  // Before this rule every /spaces route fell through to DEFAULT_PANELS, so the column beside a
  // Space showed platform pulse, platform presence, OTHER communities' new circles and
  // platform-wide events. These cases are the consequence, not the shape: a Space route resolves
  // to keys that are all Space-scoped, and the four surfaces that must NOT be scoped still are not.
  it('gives a Space route the Space\'s own panels, never the platform default', () => {
    const own = ['spaceevents', 'spacecircles', 'spaceteam']
    expect(pageRailPanels('/spaces/royaltemple')).toEqual(own)
    // Every profile tab is still inside the Space, so each keeps the Space rail.
    expect(pageRailPanels('/spaces/royaltemple/calendar')).toEqual(own)
    expect(pageRailPanels('/spaces/royaltemple/circles')).toEqual(own)
    expect(pageRailPanels('/spaces/royaltemple/discussion')).toEqual(own)
    expect(pageRailPanels('/spaces/royaltemple/people')).toEqual(own)
    // And the member-facing sub-surfaces that are not profile tabs.
    expect(pageRailPanels('/spaces/royaltemple/practices')).toEqual(own)
    expect(pageRailPanels('/spaces/royaltemple/journeys')).toEqual(own)
    // NOT ONE platform panel rides along: the whole defect was a column pointing away.
    for (const p of ['/spaces/royaltemple', '/spaces/royaltemple/calendar']) {
      expect(pageRailPanels(p).every((k) => k.startsWith('space'))).toBe(true)
    }
  })

  it('does not swallow the /spaces surfaces that are NOT a Space', () => {
    const dflt = ['pulse', 'activenow', 'newcircles', 'events']
    // The directory, the provisioning wizard, the my-Spaces list: browse surfaces, pointed outward
    // on purpose. The invite landing carries a TOKEN, not a slug, so there is nothing to scope to.
    expect(pageRailPanels('/spaces')).toEqual(dflt)
    expect(pageRailPanels('/spaces/directory')).toEqual(dflt)
    expect(pageRailPanels('/spaces/new')).toEqual(dflt)
    expect(pageRailPanels('/spaces/operating')).toEqual(dflt)
    expect(pageRailPanels('/spaces/invite/abc123')).toEqual(dflt)
  })

  it('leaves the owner consoles on the platform rail (they are not a membership experience)', () => {
    const dflt = ['pulse', 'activenow', 'newcircles', 'events']
    expect(pageRailPanels('/spaces/royaltemple/manage')).toEqual(dflt)
    expect(pageRailPanels('/spaces/royaltemple/manage/circles')).toEqual(dflt)
    expect(pageRailPanels('/spaces/royaltemple/settings')).toEqual(dflt)
    expect(pageRailPanels('/spaces/royaltemple/settings/email')).toEqual(dflt)
    expect(pageRailPanels('/spaces/royaltemple/crm')).toEqual(dflt)
    expect(pageRailPanels('/spaces/royaltemple/edit-page')).toEqual(dflt)
    expect(pageRailPanels('/spaces/royaltemple/marketing')).toEqual(dflt)
    expect(pageRailPanels('/spaces/royaltemple/loom')).toEqual(dflt)
  })

  it('reads the slug off the path, because getActiveSpace is unset when the rail renders', () => {
    expect(spaceSlugFromPath('/spaces/royaltemple')).toBe('royaltemple')
    expect(spaceSlugFromPath('/spaces/royaltemple/calendar')).toBe('royaltemple')
    expect(spaceSlugFromPath('/spaces/royaltemple/manage')).toBeNull()
    expect(spaceSlugFromPath('/spaces/directory')).toBeNull()
    expect(spaceSlugFromPath('/spaces')).toBeNull()
    expect(spaceSlugFromPath('/circles/north-county')).toBeNull()
    expect(spaceSlugFromPath('/')).toBeNull()
    // A slug is lowercase-alphanumeric-dash; anything else is not a Space route we know.
    expect(spaceSlugFromPath('/spaces/Royal Temple')).toBeNull()
    expect(spaceSlugFromPath('/spaces/-royal')).toBeNull()
  })

  it('falls back to a full, content-aware default for unmapped routes (never bare)', () => {
    const dflt = ['pulse', 'activenow', 'newcircles', 'events']
    expect(pageRailPanels('/some/new/section')).toEqual(dflt)
    expect(pageRailPanels('/settings')).toEqual(dflt)
    // the default leads with panels that effectively always render (pulse) or self-fall-back
    expect(pageRailPanels('/anything')[0]).toBe('pulse')
  })
})
