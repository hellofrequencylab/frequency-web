import { describe, expect, it } from 'vitest'
import { owningSpaceSlug } from './owning-space'

const ROOT = 'root-id'

describe('owningSpaceSlug', () => {
  it('names the Space a Circle belongs to', () => {
    expect(owningSpaceSlug({ space_id: 's1', space: { slug: 'wildheart', type: 'business' } }, ROOT)).toBe('wildheart')
  })

  it('treats the platform root Space as no Space', () => {
    expect(owningSpaceSlug({ space_id: ROOT, space: { slug: 'frequency', type: 'business' } }, ROOT)).toBeNull()
    expect(owningSpaceSlug({ space_id: 'x', space: { slug: 'frequency', type: 'root' } }, null)).toBeNull()
  })

  it('is null for a personal Circle', () => {
    expect(owningSpaceSlug({ space_id: null, space: null }, ROOT)).toBeNull()
    expect(owningSpaceSlug({ space_id: 's1', space: null }, ROOT)).toBeNull()
  })
})
