import { describe, expect, it } from 'vitest'
import { isConsoleRoute, isSpaceOwnerConsole } from './console-route'

describe('isSpaceOwnerConsole (SCAN-909)', () => {
  it('is the Space profile opened as the owner console', () => {
    expect(isSpaceOwnerConsole('/spaces/heart-on-fire', 'manage')).toBe(true)
    expect(isSpaceOwnerConsole('/spaces/heart-on-fire/', 'manage')).toBe(true)
  })

  it('is not another panel, a plain profile, a sub-tab or another route', () => {
    expect(isSpaceOwnerConsole('/spaces/heart-on-fire', 'members')).toBe(false)
    expect(isSpaceOwnerConsole('/spaces/heart-on-fire', null)).toBe(false)
    expect(isSpaceOwnerConsole('/spaces/heart-on-fire/events', 'manage')).toBe(false)
    expect(isSpaceOwnerConsole('/circles/heart-on-fire', 'manage')).toBe(false)
    expect(isSpaceOwnerConsole(null, 'manage')).toBe(false)
  })

  it('stays a member route, not a console route (the shell keeps its rails)', () => {
    expect(isConsoleRoute('/spaces/heart-on-fire')).toBe(false)
    expect(isConsoleRoute('/spaces/heart-on-fire/manage')).toBe(true)
  })
})

describe('every console menu row opens inside its console (LIVE-1199)', () => {
  it('treats the operator Pages and Funnels routes and the Space menu rows as console routes', () => {
    for (const path of ['/pages', '/pages/sequences', '/pages/sequences/welcome/edit', '/admin/entry-points']) expect(isConsoleRoute(path)).toBe(true)
    for (const row of ['practices', 'journeys', 'loom', 'marketing', 'setup']) expect(isConsoleRoute(`/spaces/royal-temple/${row}`)).toBe(true)
  })
  it('keeps the member and public routes in the member shell', () => {
    for (const path of ['/entry-points', '/pagesx', '/spaces/royal-temple/reviews', '/spaces/royal-temple/events', '/practices', '/journeys']) expect(isConsoleRoute(path)).toBe(false)
  })
})
