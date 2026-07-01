import { describe, it, expect } from 'vitest'
import type { Data } from '@measured/puck'
import { isRenderableSpaceDoc } from './space'
import { generateDefaultSpacePage } from './space-default'

// SPACE PAGE DOC GUARD contract. The type-driven template presets are retired; the only survivor here
// is the renderability guard: a stored Puck doc is trusted only when it has a non-empty content array
// AND every block is still a known block type against the current config (a doc authored against a
// retired block set fails closed). PURE, no IO.

describe('isRenderableSpaceDoc', () => {
  const goodDoc: Data = generateDefaultSpacePage('Willow Studio')

  it('accepts a doc where every block is a known type', () => {
    expect(isRenderableSpaceDoc(goodDoc)).toBe(true)
  })

  it('rejects a doc with an unknown block type (stale block set)', () => {
    const stale: Data = { root: {}, content: [{ type: 'RetiredBlock', props: { id: 'x' } }] }
    expect(isRenderableSpaceDoc(stale)).toBe(false)
  })

  it('rejects an empty content array', () => {
    expect(isRenderableSpaceDoc({ root: {}, content: [] })).toBe(false)
  })

  it('rejects a missing / malformed value', () => {
    for (const bad of [null, undefined, 7, 'x', [], {}, { content: null }]) {
      expect(isRenderableSpaceDoc(bad as unknown)).toBe(false)
    }
  })
})
