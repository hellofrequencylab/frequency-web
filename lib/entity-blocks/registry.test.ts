import { describe, it, expect } from 'vitest'
import {
  ENTITY_BLOCKS,
  entityBlockById,
  blockSupportsKind,
  blocksForKind,
  profilePaletteForKind,
  MEMBER_CHROME_BLOCK_IDS,
} from './registry'
import { PROFILE_BLOCKS } from '@/lib/spaces/profile-blocks'

describe('unified entity-block registry', () => {
  it('has unique ids and ascending order', () => {
    const ids = ENTITY_BLOCKS.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    const orders = ENTITY_BLOCKS.map((b) => b.order)
    expect([...orders].sort((a, b) => a - b)).toEqual(orders)
  })

  it('carries no em dashes in copy (CONTENT-VOICE §10)', () => {
    expect(JSON.stringify(ENTITY_BLOCKS)).not.toContain('—')
  })

  it('every block supports at least one kind, and only known kinds', () => {
    for (const b of ENTITY_BLOCKS) {
      expect(b.kinds.length).toBeGreaterThan(0)
      for (const k of b.kinds) expect(['member', 'space']).toContain(k)
    }
  })

  it('only space DATA blocks may require a function', () => {
    for (const b of ENTITY_BLOCKS) {
      if (b.requiresFunction) {
        expect(b.category).toBe('data')
        expect(b.kinds).toEqual(['space'])
      }
    }
  })

  it('content blocks are authored (never function-gated) and support at least one kind', () => {
    // The legacy authored blocks are shared by both kinds; the ADR-542 free-form blocks (callout, features)
    // and the design blocks (photoHero / editorial / cardGrid / zigzag / accentBeat + the ADR-571 text blocks
    // displayHeading / prose) are SPACE-only. All are authored, so none is gated on a space function.
    const spaceOnly = new Set([
      'callout',
      'features',
      'photoHero',
      'editorial',
      'cardGrid',
      'zigzag',
      'accentBeat',
      'displayHeading',
      'prose',
    ])
    for (const b of ENTITY_BLOCKS.filter((x) => x.category === 'content')) {
      expect(b.kinds).toContain('space')
      if (!spaceOnly.has(b.id)) expect(b.kinds).toContain('member')
      expect(b.requiresFunction).toBeUndefined()
    }
  })

  it('subsumes every space profile block (S1) as a space-supporting block', () => {
    for (const pb of PROFILE_BLOCKS) {
      // S1 'highlights' unified to 'stats'; the rest keep their id.
      const id = pb.id === 'highlights' ? 'stats' : pb.id
      const unified = entityBlockById(id)
      expect(unified, `missing unified block for space profile block ${pb.id}`).not.toBeNull()
      expect(blockSupportsKind(unified!, 'space')).toBe(true)
    }
  })

  it('profilePaletteForKind narrows to the curated core (ADR-529 → ADR-536)', () => {
    const space = profilePaletteForKind('space').map((b) => b.id)
    // Core kept (SPACE, ADR-542): the 9 connected data sections + the 4 free-form blocks (Callout, Gallery,
    // Journeys, Features). `business` (Find us online) covers links.
    for (const id of ['about', 'story', 'offerings', 'booking', 'events', 'team', 'reviews', 'contact', 'business', 'callout', 'gallery', 'journeys', 'features', 'embed']) {
      expect(space).toContain(id)
    }
    // Excluded from the SPACE palette (ADR-542): the legacy authored blocks (heading/text/links/image →
    // covered by Callout + the connected sections) and the never-wired data blocks.
    for (const id of ['highlights', 'stats', 'practices', 'circles', 'faq', 'updates', 'quote', 'divider', 'links', 'heading', 'text', 'image']) {
      expect(space).not.toContain(id)
    }
    // The member palette keeps topfriends + the authored links list + the content essentials; `business` is
    // space-only so it never reaches the member palette.
    const member = profilePaletteForKind('member').map((b) => b.id)
    expect(member).toContain('topfriends')
    expect(member).toContain('links')
    expect(member).not.toContain('business')
    expect(member).not.toContain('gallery')
    expect(member).not.toContain('divider')
  })

  it('blocksForKind returns member vs space palettes', () => {
    const member = blocksForKind('member').map((b) => b.id)
    const space = blocksForKind('space').map((b) => b.id)
    expect(member).toContain('topfriends')
    expect(member).not.toContain('offerings')
    expect(space).toContain('offerings')
    expect(space).not.toContain('topfriends')
    // shared blocks appear in both
    for (const id of ['about', 'stats', 'heading', 'links']) {
      expect(member).toContain(id)
      expect(space).toContain(id)
    }
  })

  it('member chrome blocks (about/stats) stay valid member+space registry blocks (ADR-522)', () => {
    // They are held out of the in-app MEMBER builder palette at the builder layer (lockedIds), NOT the
    // registry — so a SPACE profile keeps its own about/highlights and the generic layout mechanics are
    // unchanged. The chrome (bio band + Standing card) is what makes them redundant on a MEMBER profile.
    for (const id of MEMBER_CHROME_BLOCK_IDS) {
      const block = entityBlockById(id)
      expect(block, `unknown chrome block ${id}`).not.toBeNull()
      expect(blockSupportsKind(block!, 'member')).toBe(true)
      expect(blockSupportsKind(block!, 'space')).toBe(true)
    }
  })
})
