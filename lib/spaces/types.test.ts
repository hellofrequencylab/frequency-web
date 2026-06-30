import { describe, it, expect } from 'vitest'
import { spaceManageHref, isConsoleSpaceType } from './types'

// spaceManageHref is the ONE place the Spaces harmonization rule lives (ADR-441 EM1-3 / EM2-3; Space
// Modes M3, ADR-461/464): the unified /manage console serves every provisionable type (coaching joined
// the console with Space Modes M3); only root keeps the legacy /settings hub. Lock both halves so a new
// console type is a deliberate, tested change.
describe('spaceManageHref (the Spaces management-entry rule)', () => {
  it('routes every CONSOLE type to /manage', () => {
    for (const type of [
      'practitioner',
      'organization',
      'business',
      'coaching',
      'event_space',
      'lab',
      'partner',
    ] as const) {
      expect(spaceManageHref(type, 'demo')).toBe('/spaces/demo/manage')
      expect(isConsoleSpaceType(type)).toBe(true)
    }
  })

  it('routes the legacy-hub type (root) to /settings', () => {
    expect(spaceManageHref('root', 'demo')).toBe('/spaces/demo/settings')
    expect(isConsoleSpaceType('root')).toBe(false)
  })
})
