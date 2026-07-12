import { describe, it, expect } from 'vitest'
import {
  ENTITY_BLOCKS,
  DESIGN_ENTITY_BLOCK_IDS,
  CORE_PROFILE_BLOCK_IDS,
  blocksForKind,
  profilePaletteForKind,
} from './registry'
import { fieldsForBlock, blockDrawsOwnCard, blockBearsText, sanitizeBlockContent } from './block-content'

// The FILLED design blocks draw their own filled background (a photo scrim / an accent wash), so their
// Background toggle defaults ON (turning it off strips that frame). The OPEN section design blocks
// (editorial / cardGrid / zigzag) render with no card, so the toggle defaults OFF and turning it on wraps
// them in a white card — the "Background on all blocks" fix. The two TEXT design blocks (ADR-571) are flat
// text (no card), like Heading / Text.
const FILLED_DESIGN_IDS = ['photoHero', 'accentBeat'] as const
const OPEN_DESIGN_IDS = ['editorial', 'cardGrid', 'zigzag'] as const
const TEXT_DESIGN_IDS = ['displayHeading', 'prose'] as const

// The five design blocks (2026) are now offered in the on-page rail arranger (ADR-565). These lock the
// registry wiring so the blocks stay AVAILABLE in the space palette and their authored fields survive the
// sanitizer (the render adapter — components/entity-blocks/design-block-view.tsx — is exercised at runtime).

describe('design blocks in the entity-block registry (ADR-565)', () => {
  it('registers all five design ids as space-only content blocks', () => {
    for (const id of DESIGN_ENTITY_BLOCK_IDS) {
      const block = ENTITY_BLOCKS.find((b) => b.id === id)
      expect(block, id).toBeTruthy()
      expect(block!.category).toBe('content')
      // Space content blocks. Several also port to email (Email Studio, 2026), so assert space membership
      // rather than an exact single-kind array; zigzag / accentBeat stay space-only.
      expect(block!.kinds).toContain('space')
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

  it('treats each FILLED design block as self-carding (Background toggle defaults on)', () => {
    for (const id of FILLED_DESIGN_IDS) {
      expect(blockDrawsOwnCard(id), id).toBe(true)
    }
  })

  it('treats the OPEN section design blocks as flat so the Background toggle adds a card (defaults off)', () => {
    for (const id of OPEN_DESIGN_IDS) {
      expect(blockDrawsOwnCard(id), id).toBe(false)
      expect(blockBearsText(id), id).toBe(true)
    }
  })

  it('treats the two TEXT design blocks as flat (no card) and text-bearing (ADR-571)', () => {
    for (const id of TEXT_DESIGN_IDS) {
      expect(blockDrawsOwnCard(id), id).toBe(false)
      expect(blockBearsText(id), id).toBe(true)
    }
  })

  it('gives the Banner a height + content-layout primitive (ADR-571 tasks 2 + 3)', () => {
    const keys = fieldsForBlock('photoHero').map((f) => f.key)
    expect(keys).toContain('height')
    expect(keys).toContain('display')
    const height = fieldsForBlock('photoHero').find((f) => f.key === 'height')
    expect(height?.type).toBe('height')
    const display = fieldsForBlock('photoHero').find((f) => f.key === 'display')
    expect(display?.type).toBe('segmented')
    expect(display?.options?.map((o) => o.value)).toEqual(['overlay', 'beside', 'below'])
  })

  it('sanitizes the Banner height + display to their allowed sets (drops garbage + defaults)', () => {
    const clean = sanitizeBlockContent('photoHero', {
      title: 'Hi',
      height: 'tall',
      display: 'beside',
    })
    expect(clean).toMatchObject({ height: 'tall', display: 'beside' })
    // default value is dropped (sparse), garbage is dropped
    const sparse = sanitizeBlockContent('photoHero', { title: 'Hi', height: 'medium', display: 'sideways' })
    expect(sparse).not.toHaveProperty('height') // matches default `medium`
    expect(sparse).not.toHaveProperty('display') // not an allowed value
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
