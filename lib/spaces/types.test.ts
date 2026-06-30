import { describe, it, expect } from 'vitest'
import { spaceManageHref } from './types'

// spaceManageHref is the ONE place the Spaces harmonization rule lives (ADR-441 EM1-3): the unified
// /manage console serves `practitioner` and `organization`; every other type keeps the legacy
// /settings hub. Lock both halves so a new console type is a deliberate, tested change.
describe('spaceManageHref (the Spaces management-entry rule)', () => {
  it('routes the CONSOLE types (practitioner, organization) to /manage', () => {
    expect(spaceManageHref('practitioner', 'river-yoga')).toBe('/spaces/river-yoga/manage')
    expect(spaceManageHref('organization', 'helping-hands')).toBe('/spaces/helping-hands/manage')
  })

  it('routes every OTHER type to the legacy /settings hub', () => {
    for (const type of ['business', 'event_space', 'coaching', 'lab', 'partner', 'root'] as const) {
      expect(spaceManageHref(type, 'demo')).toBe('/spaces/demo/settings')
    }
  })
})
