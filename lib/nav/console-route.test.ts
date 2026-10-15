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
