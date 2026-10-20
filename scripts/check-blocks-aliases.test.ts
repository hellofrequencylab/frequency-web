import { describe, it, expect } from 'vitest'
import { aliasProblems } from './check-blocks.mjs'
import { BLOCK_ID_ALIASES } from '../lib/entity-blocks/aliases'
import { ADOPTED_BLOCKS } from '../lib/entity-blocks/contract'

// Locks the alias arm of check:blocks (B9): an alias is a safe 1:1 rename or the gate says why not.
const adopted = ['text', 'image']

describe('check:blocks, aliases', () => {
  it('the live alias map holds', () => {
    expect(aliasProblems(BLOCK_ID_ALIASES, ADOPTED_BLOCKS.map((d) => d.type))).toEqual([])
  })

  it('accepts a retired id that points at an adopted block', () => {
    expect(aliasProblems(new Map([['old-text', 'text']]), adopted)).toEqual([])
  })

  it('rejects a target that is not adopted', () => {
    expect(aliasProblems(new Map([['old', 'ghost']]), adopted)).toHaveLength(1)
  })

  it('rejects an old id that is still an adopted block', () => {
    expect(aliasProblems(new Map([['image', 'text']]), adopted)).toHaveLength(1)
  })

  it('rejects a self alias and a chain', () => {
    expect(aliasProblems(new Map([['a', 'a']]), adopted).length).toBeGreaterThan(0)
    expect(aliasProblems(new Map([['a', 'b'], ['b', 'text']]), adopted).some((p) => p.includes('chains'))).toBe(true)
  })
})
