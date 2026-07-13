import { describe, it, expect } from 'vitest'
import {
  LIBRARY_KINDS,
  LIBRARY_STATUSES,
  LIBRARY_VISIBILITIES,
  LIBRARY_DOWNLOAD_POLICIES,
  LIBRARY_RENDITION_KINDS,
  LIBRARY_USAGE_CONTEXTS,
} from './types'
import { RENDITION_PRESETS, CROP_FRAMES } from './renditions'

// Locks the catalog vocabulary against the DB CHECK constraints in the migrations
// (20260919000000_library_assets.sql, 20260920000000_library_dam.sql,
// 20260925000000_library_lanes_expansion.sql, 20261010000001_library_sequence_kind.sql,
// 20261150000000_library_assets_av.sql). If these lists and the migrations ever drift, one is wrong.
describe('library catalog vocab', () => {
  it('kinds match the migration CHECK set', () => {
    expect([...LIBRARY_KINDS].sort()).toEqual(
      ['app', 'app_asset', 'audio', 'copy', 'element', 'flow', 'font', 'icon', 'image', 'sequence', 'template', 'theme', 'token', 'video'].sort(),
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

  it('download policies match the migration CHECK set', () => {
    expect([...LIBRARY_DOWNLOAD_POLICIES].sort()).toEqual(['members', 'open', 'staff'].sort())
  })

  it('vocab lists are unique', () => {
    for (const list of [
      LIBRARY_KINDS,
      LIBRARY_STATUSES,
      LIBRARY_VISIBILITIES,
      LIBRARY_DOWNLOAD_POLICIES,
      LIBRARY_RENDITION_KINDS,
      LIBRARY_USAGE_CONTEXTS,
    ]) {
      expect(new Set(list).size).toBe(list.length)
    }
  })
})

describe('rendition + crop presets', () => {
  it('has a preset for every non-custom rendition kind', () => {
    for (const kind of LIBRARY_RENDITION_KINDS) {
      if (kind === 'custom') continue
      expect(RENDITION_PRESETS[kind]).toBeTruthy()
    }
  })

  it('crop frames carry a positive ratio or null (freeform)', () => {
    for (const frame of CROP_FRAMES) {
      expect(frame.ratio === null || frame.ratio > 0).toBe(true)
    }
  })
})
