import { describe, it, expect } from 'vitest'
import {
  ENTITY_BLOCKS,
  DESIGN_ENTITY_BLOCK_IDS,
  CORE_PROFILE_BLOCK_IDS,
  blocksForKind,
  profilePaletteForKind,
} from './registry'
import { fieldsForBlock, blockDrawsOwnCard, sanitizeBlockContent } from './block-content'

// The five design blocks (2026) are now offered in the on-page rail arranger (ADR-565). These lock the
// registry wiring so the blocks stay AVAILABLE in the space palette and their authored fields survive the
// sanitizer (the render adapter — components/entity-blocks/design-block-view.tsx — is exercised at runtime).

describe('design blocks in the entity-block registry (ADR-565)', () => {
  it('registers all five design ids as space-only content blocks', () => {
    for (const id of DESIGN_ENTITY_BLOCK_IDS) {
      const block = ENTITY_BLOCKS.find((b) => b.id === id)
      expect(block, id).toBeTruthy()
      expect(block!.category).toBe('content')
      expect(block!.kinds).toEqual(['space'])
      expect(block!.requiresFunction).toBeUndefined()
    }
  })

  it('offers every design block in the SPACE arranger palette', () => {
    const palette = new Set(profilePaletteForKind('space').map((b) => b.id))
    for (const id of DESIGN_ENTITY_BLOCK_IDS) {
      expect(palette.has(id), `${id} should be in the space palette`).toBe(true)
      expect(CORE_PROFILE_BLOCK_IDS.has(id)).toBe(true)
    }
  })

  it('never offers a design block in the MEMBER palette (space-only)', () => {
    const memberPalette = new Set(blocksForKind('member').map((b) => b.id))
    for (const id of DESIGN_ENTITY_BLOCK_IDS) {
      expect(memberPalette.has(id)).toBe(false)
    }
  })

  it('gives each design block an editable field schema', () => {
    for (const id of DESIGN_ENTITY_BLOCK_IDS) {
      expect(fieldsForBlock(id).length, id).toBeGreaterThan(0)
    }
  })

  it('treats each design block as self-carding (Background toggle defaults on)', () => {
    for (const id of DESIGN_ENTITY_BLOCK_IDS) {
      expect(blockDrawsOwnCard(id), id).toBe(true)
    }
  })

  it('sanitizes a design block bag to its schema (keeps known fields, drops unknown)', () => {
    const clean = sanitizeBlockContent('photoHero', {
      eyebrow: 'Welcome',
      title: 'Our home',
      buttonUrl: 'https://example.com',
      rogue: 'javascript:alert(1)',
    })
    expect(clean).toMatchObject({ eyebrow: 'Welcome', title: 'Our home', buttonUrl: 'https://example.com' })
    expect(clean).not.toHaveProperty('rogue')
  })

  it('maps card-grid cards through the features repeater shape', () => {
    const clean = sanitizeBlockContent('cardGrid', {
      title: 'What you get',
      cards: [{ icon: '⭐', title: 'Fast', text: 'Really fast' }],
    })
    expect(clean?.cards).toEqual([{ icon: '⭐', title: 'Fast', text: 'Really fast' }])
  })
})
