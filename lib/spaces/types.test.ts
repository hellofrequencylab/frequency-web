import { describe, it, expect } from 'vitest'
import { spaceManageHref, isConsoleSpaceType } from './types'

// spaceManageHref is the ONE place the Spaces harmonization rule lives (ADR-441 EM1-3 / EM2-3): the
// unified /manage console serves every provisionable type; only root keeps the legacy /settings hub.
// After the ADR-552 collapse the provisionable set is just `business` + `nonprofit`. Lock both halves
// so a new console type is a deliberate, tested change.
describe('spaceManageHref (the Spaces management-entry rule)', () => {
  it('routes every CONSOLE type to /manage', () => {
    for (const type of ['business', 'nonprofit'] as const) {
      expect(spaceManageHref(type, 'demo')).toBe('/spaces/demo/manage')
      expect(isConsoleSpaceType(type)).toBe(true)
    }
  })

  it('routes the legacy-hub type (root) to /settings', () => {
    expect(spaceManageHref('root', 'demo')).toBe('/spaces/demo/settings')
    expect(isConsoleSpaceType('root')).toBe(false)
  })
})
