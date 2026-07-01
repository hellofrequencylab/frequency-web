import { describe, it, expect } from 'vitest'
import {
  LIBRARY_KINDS,
  LIBRARY_STATUSES,
  LIBRARY_VISIBILITIES,
} from './types'

// Locks the catalog vocabulary against the DB CHECK constraints in
// supabase/migrations/20260919000000_library_assets.sql. If these lists and the
// migration ever drift, one of them is wrong.
describe('library catalog vocab', () => {
  it('kinds match the migration CHECK set', () => {
    expect([...LIBRARY_KINDS].sort()).toEqual(
      ['app_asset', 'element', 'flow', 'icon', 'image', 'template', 'theme'].sort(),
    )
  })

  it('statuses match the migration CHECK set', () => {
    expect([...LIBRARY_STATUSES].sort()).toEqual(
      ['approved', 'archived', 'draft', 'final', 'in_review'].sort(),
    )
  })

  it('visibilities match the migration CHECK set', () => {
    expect([...LIBRARY_VISIBILITIES].sort()).toEqual(['private', 'public', 'space'].sort())
  })

  it('vocab lists are unique', () => {
    for (const list of [LIBRARY_KINDS, LIBRARY_STATUSES, LIBRARY_VISIBILITIES]) {
      expect(new Set(list).size).toBe(list.length)
    }
  })
})
