import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

// LIVE-668: the unlock map is the one answer to "which feature wakes up when". It must agree with
// the stage ladder, its gates must behave, and docs/UNLOCKS.md must be the map rendered.
// `pnpm unlocks:doc` (UNLOCKS_WRITE=1) rewrites the doc from the map.

import { MEMBER_STAGES } from './member-progress'
import { STAGE_ORDER, UNLOCKS, isUnlocked, renderUnlocksDoc, roleUnlocked, stageUnlocked } from './unlocks'

const DOC = join(process.cwd(), 'docs/UNLOCKS.md')

describe('the unlock map', () => {
  it('names the same stages, in the same order, as the progress ladder', () => {
    expect(MEMBER_STAGES.map((s) => s.key)).toEqual([...STAGE_ORDER])
    expect(MEMBER_STAGES.map((s) => s.index)).toEqual(STAGE_ORDER.map((_, i) => i))
  })

  it('gives every entry a floor', () => {
    for (const [key, u] of Object.entries(UNLOCKS)) {
      expect('stage' in u || 'role' in u, key).toBe(true)
    }
  })

  it('holds a stage feature back until its stage', () => {
    expect(stageUnlocked('feed.resource-doors', 1)).toBe(false)
    expect(stageUnlocked('feed.resource-doors', 2)).toBe(true)
    expect(stageUnlocked('feed.pillar-balance', 2)).toBe(false)
    expect(stageUnlocked('feed.pillar-balance', 3)).toBe(true)
    // A stage feature has no role floor.
    expect(roleUnlocked('feed.pillar-balance', 'member')).toBe(true)
  })

  it('holds a role feature back below its floor', () => {
    expect(roleUnlocked('lead.outreach', 'member')).toBe(false)
    expect(roleUnlocked('lead.outreach', 'host')).toBe(true)
    expect(roleUnlocked('view-as', 'mentor')).toBe(true)
    expect(roleUnlocked('view-as', null)).toBe(false)
    expect(isUnlocked('profile.member-support', { role: 'guide' })).toBe(true)
    expect(isUnlocked('profile.member-support', {})).toBe(false)
  })
})

describe('docs/UNLOCKS.md', () => {
  it('is the map rendered', () => {
    const rendered = renderUnlocksDoc()
    if (process.env.UNLOCKS_WRITE) writeFileSync(DOC, rendered)
    expect(readFileSync(DOC, 'utf8')).toBe(rendered)
  })
})
