import { describe, it, expect } from 'vitest'
import { PROFILE_BLOCKS } from '@/lib/spaces/profile-blocks'
import { profilePaletteForKind, CORE_PROFILE_BLOCK_IDS } from '@/lib/entity-blocks/registry'
import { isFunctionBackedBlock, blockDataSource } from '@/lib/entity-blocks/block-data-sources'
import { fieldsForBlock, sanitizeBlockContent } from '@/lib/entity-blocks/block-content'
import { SPACE_PROFILE_BLOCKS } from './space-profile-modules'

// THE MEMBERSHIPS BLOCK IS REGISTERED IN FOUR PLACES, AND HALF-REGISTERING IT IS SILENT (LIVE-510).
//
// A block in the unified registry but not in SPACE_PROFILE_BLOCKS is offered in the palette and
// renders NOTHING once placed (toProfileBlockId returns null, fail-safe by design). One in
// SPACE_PROFILE_BLOCKS but not in CORE_PROFILE_BLOCK_IDS renders where it already sits and can
// never be added. One in neither of the S1 sets but with a data source is what `memberships`
// ALREADY WAS before this change: block-data-sources.ts has carried a `memberships` source since
// ADR-573 item 5, under a comment reading "there is no registry block yet". None of those states
// fails a build, a type check, or any other test. This one walks all four.

describe('the memberships block registration', () => {
  it('is in the S1 profile registry, gated on the memberships function', () => {
    const def = PROFILE_BLOCKS.find((b) => b.id === 'memberships')
    expect(def).toBeTruthy()
    // The function gate is the operator switch, the same shape Booking takes on `availability`.
    // Without it the block lands in a fresh default for a Space that sells no memberships.
    expect(def!.requiresFunction).toBe('memberships')
  })

  it('resolves to a render component, or it would be offered and then draw nothing', () => {
    expect(SPACE_PROFILE_BLOCKS.memberships).toBeTypeOf('function')
  })

  it('is offered by the curated SPACE palette, or it could never be added to a page', () => {
    expect(CORE_PROFILE_BLOCK_IDS.has('memberships')).toBe(true)
    expect(profilePaletteForKind('space').map((b) => b.id)).toContain('memberships')
  })

  it('is NOT offered to a member profile: a person has no membership tiers to sell', () => {
    expect(profilePaletteForKind('member').map((b) => b.id)).not.toContain('memberships')
  })

  it('keeps the data source it has had all along, pointed at the memberships console', () => {
    expect(isFunctionBackedBlock('memberships')).toBe(true)
    const source = blockDataSource('memberships')
    expect(source?.functionKey).toBe('memberships')
    // The source gates on the function switch AND on rows, so the palette data-locks the block out
    // until the Space actually publishes a tier. That is what stops it being offered over nothing.
    expect(source?.createHref('royaltemple')).toContain('royaltemple')
  })

  // THE COPY THE BLOCK READS MUST BE THE COPY THE EDITOR SAVES, and getting that wrong is silent.
  // `sanitizeBlockContent` builds the stored bag from `fieldsForBlock(id)` ALONE, so a key the block
  // reads but the schema does not declare is stripped on every save: the operator types the words,
  // presses save, and the block falls back to its default copy forever with no error anywhere. The
  // first version of this block read `body` and `ctaLabel` without declaring either.
  it('persists the two strings the band renders, instead of stripping them on save', () => {
    const typed = { eyebrow: 'Join', title: 'Become a Temple Member', body: 'What belonging here means.', ctaLabel: 'Become a member' }
    expect(sanitizeBlockContent('memberships', typed)).toEqual(typed)
  })

  it('declares an editable control for every key the band reads', () => {
    const keys = fieldsForBlock('memberships').map((f) => f.key)
    for (const read of ['eyebrow', 'title', 'body', 'ctaLabel']) {
      expect(keys, `the band renders ${read} but the editor has no field for it`).toContain(read)
    }
  })

  // NO PRICE ON THE BAND (owner instruction 2026-09-25). The tiers live in the dialog this block
  // opens; the band itself carries no priced field at all, so there is nothing an operator could
  // fill in that would put a number on the page before a visitor asked for one.
  it('offers no priced field, so the band can never advertise a number', () => {
    const keys = fieldsForBlock('memberships').map((f) => f.key.toLowerCase())
    for (const priced of ['price', 'amount', 'cost', 'cents', 'items']) {
      expect(keys, `memberships declares a ${priced} field`).not.toContain(priced)
    }
  })

  it('every S1 profile block resolves to a component, so no sibling is half-registered either', () => {
    for (const def of PROFILE_BLOCKS) {
      expect(
        SPACE_PROFILE_BLOCKS[def.id],
        `${def.id} is in PROFILE_BLOCKS with no render component`,
      ).toBeTypeOf('function')
    }
  })
})
