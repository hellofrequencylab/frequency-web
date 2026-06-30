import { describe, it, expect } from 'vitest'
import { spaceManageHref, isConsoleSpaceType } from './types'

// spaceManageHref is the ONE place the Spaces harmonization rule lives (ADR-441 EM1-3 / EM2-3): the
// unified /manage console serves every provisionable type except coaching; coaching (and root) keep
// the legacy /settings hub. Lock both halves so a new console type is a deliberate, tested change.
describe('spaceManageHref (the Spaces management-entry rule)', () => {
  it('routes every CONSOLE type to /manage', () => {
    for (const type of ['practitioner', 'organization', 'business', 'event_space', 'lab', 'partner'] as const) {
      expect(spaceManageHref(type, 'demo')).toBe('/spaces/demo/manage')
      expect(isConsoleSpaceType(type)).toBe(true)
    }
  })

  it('routes the legacy-hub types (coaching, root) to /settings', () => {
    for (const type of ['coaching', 'root'] as const) {
      expect(spaceManageHref(type, 'demo')).toBe('/spaces/demo/settings')
      expect(isConsoleSpaceType(type)).toBe(false)
    }
  })
})
