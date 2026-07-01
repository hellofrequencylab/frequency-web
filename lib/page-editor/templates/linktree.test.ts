import { describe, it, expect } from 'vitest'
import { linktreePreset, spaceSpotlightPreset } from './linktree'
import { config } from '@/lib/page-editor/config'
import { SPOTLIGHT_PUCK_TYPES } from '@/lib/spotlight/puck/convert'

// SPOTLIGHT PRESET contract (Phase 3 + the Phase 4 shared identity). Pure, no IO. Locks: the member
// default preset is unchanged (no identity header, so a member personal Spotlight keeps its existing
// treatment), a brand/space Spotlight LEADS with the SHARED SpaceIdentityHeader (uniform with its
// landing page), every seeded block is a registered block type, and no default copy carries an em dash.

const KNOWN_BLOCKS = new Set(Object.keys(config.components))

describe('the member Spotlight default preset (unchanged)', () => {
  it('does NOT lead with the shared identity header (member keeps their own treatment)', () => {
    expect(linktreePreset().content[0]?.type).not.toBe('SpaceIdentityHeader')
    expect(linktreePreset().content.some((b) => b.type === 'SpaceIdentityHeader')).toBe(false)
  })

  it('opens with the intro text then the link tree', () => {
    const ts = linktreePreset().content.map((b) => b.type)
    expect(ts[0]).toBe(SPOTLIGHT_PUCK_TYPES.text)
    expect(ts).toContain(SPOTLIGHT_PUCK_TYPES.links)
  })
})

describe('the brand/space Spotlight preset (shared identity, Phase 4)', () => {
  it('LEADS with the shared SpaceIdentityHeader (uniform with the landing page)', () => {
    expect(spaceSpotlightPreset().content[0]?.type).toBe('SpaceIdentityHeader')
  })

  it('withIdentity is the ONLY difference from the member preset (identity prepended)', () => {
    const withId = spaceSpotlightPreset().content.map((b) => b.type)
    const member = linktreePreset().content.map((b) => b.type)
    expect(withId).toEqual(['SpaceIdentityHeader', ...member])
  })

  it('keeps the member link-tree body below the identity header', () => {
    const ts = spaceSpotlightPreset().content.map((b) => b.type)
    expect(ts).toContain(SPOTLIGHT_PUCK_TYPES.links)
    expect(ts).toContain(SPOTLIGHT_PUCK_TYPES.topfriends)
  })
})

describe('both presets are valid + on-voice', () => {
  it('every seeded block is a currently-registered block type', () => {
    for (const doc of [linktreePreset(), spaceSpotlightPreset()]) {
      expect(doc.content.every((b) => typeof b.type === 'string' && KNOWN_BLOCKS.has(b.type))).toBe(true)
    }
  })

  it('never emits an em dash in any string prop (CONTENT-VOICE punctuation)', () => {
    for (const doc of [linktreePreset(), spaceSpotlightPreset()]) {
      expect(JSON.stringify(doc)).not.toContain('—')
    }
  })
})
