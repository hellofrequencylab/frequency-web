import { describe, it, expect } from 'vitest'
import type { Data } from '@measured/puck'
import { toPreviewBlocks } from './preview-blocks'

// The pure content→tappable mapping the mobile WYSIWYG preview relies on: each top-level block
// becomes its own single-item document keyed by the block's stable id, so a tap maps to the
// right block. Component render tests aren't feasible here (node env), so we cover this layer.

describe('toPreviewBlocks', () => {
  it('returns an empty list for null / empty documents', () => {
    expect(toPreviewBlocks(null)).toEqual([])
    expect(toPreviewBlocks(undefined)).toEqual([])
    expect(toPreviewBlocks({ root: {}, content: [] })).toEqual([])
  })

  it('splits each block into its own single-item doc, preserving order + id', () => {
    const data: Data = {
      root: {},
      content: [
        { type: 'SpotlightHeading', props: { id: 'h1', text: 'Hi' } },
        { type: 'LinkTree', props: { id: 'l1', items: [] } },
      ],
    }
    const out = toPreviewBlocks(data)
    expect(out.map((b) => b.id)).toEqual(['h1', 'l1'])
    // Each doc renders exactly ONE block (its own), in order.
    expect(out[0].doc.content).toHaveLength(1)
    expect(out[0].doc.content[0]).toEqual(data.content[0])
    expect(out[1].doc.content[0]).toEqual(data.content[1])
  })

  it('falls back to an index-based id when a block has no props.id', () => {
    const data = {
      root: {},
      content: [{ type: 'SpotlightDivider', props: {} }],
    } as unknown as Data
    const out = toPreviewBlocks(data)
    expect(out[0].id).toBe('block-0')
    expect(out[0].doc.content).toHaveLength(1)
  })

  it('carries the document root onto each single-item doc', () => {
    const data = {
      root: { props: { title: 'x' } },
      content: [{ type: 'SpotlightText', props: { id: 't1', text: 'a' } }],
    } as unknown as Data
    const out = toPreviewBlocks(data)
    expect(out[0].doc.root).toEqual(data.root)
  })
})
