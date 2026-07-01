import { describe, it, expect } from 'vitest'
import { spacesComponents } from './spaces'
import { config } from '@/lib/page-editor/config'

// Space CONTENT block field schemas (Puck content blocks, Phase 2). Pure, no IO. Locks: the four new
// blocks (Cover + the three dynamic blocks) are well-formed ComponentConfigs (fields + defaultProps +
// render), every default prop has a matching field, they are registered in the shared config, and
// they are grouped into the left-bar categories. Importing spacesComponents ALSO proves the module is
// client-safe (it must load without dragging in a server-only import, or this import throws).

const KEYS = ['Cover', 'SpaceUpdates', 'SpaceReviews', 'SpaceFAQ'] as const

describe('the four new Space content blocks are well-formed ComponentConfigs', () => {
  for (const key of KEYS) {
    it(`${key} has fields, defaultProps, and a render`, () => {
      const block = spacesComponents[key]
      expect(block).toBeTruthy()
      expect(typeof block.render).toBe('function')
      expect(block.fields).toBeTruthy()
      expect(block.defaultProps).toBeTruthy()
    })

    it(`${key} declares a field for every default prop (no orphan defaults)`, () => {
      const block = spacesComponents[key]
      const fieldKeys = new Set(Object.keys(block.fields ?? {}))
      // `id` is Puck-managed and never a declared field; ignore it.
      for (const propKey of Object.keys(block.defaultProps ?? {})) {
        if (propKey === 'id') continue
        expect(fieldKeys.has(propKey)).toBe(true)
      }
    })
  }
})

describe('the new blocks are registered + categorised in the shared config', () => {
  it('every new block is in config.components', () => {
    for (const key of KEYS) {
      expect(config.components[key]).toBeTruthy()
    }
  })

  it('Cover is in the Media category; the dynamic Space blocks are in Space content', () => {
    const cats = config.categories ?? {}
    expect(cats.media?.components).toContain('Cover')
    for (const key of ['SpaceUpdates', 'SpaceReviews', 'SpaceFAQ'] as const) {
      expect(cats.spaceContent?.components).toContain(key)
    }
  })
})

describe('CONTENT-VOICE: no em dashes in any default copy', () => {
  it('none of the new blocks seed an em dash', () => {
    for (const key of KEYS) {
      const json = JSON.stringify(spacesComponents[key].defaultProps)
      expect(json).not.toContain('—')
    }
  })
})
