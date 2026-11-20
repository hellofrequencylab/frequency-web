import { describe, expect, it } from 'vitest'
import type { NodeLayout } from '@/lib/entity-blocks/node-tree'
import { linkForHref, previewLinks, sameLinkUrl } from './preview-target'

const layout = {
  rows: [
    { id: 'r0', cells: [[{ nid: 'a1', type: 'about' }]] },
    {
      id: 'r1',
      cells: [[{ nid: 'l1', type: 'links', content: { items: [{ label: 'Launch', url: 'https://frequencylocal.com/create-a-space' }, { label: 'IG', url: 'https://instagram.com/x' }] } }]],
    },
  ],
  bench: [],
} as unknown as NodeLayout

describe('preview targets', () => {
  it('reads the owner links in order with their block', () => {
    expect(previewLinks(layout).map((l) => [l.nid, l.index])).toEqual([['l1', 0], ['l1', 1]])
  })
  it('matches an address however the theme spells it', () => {
    expect(sameLinkUrl('https://www.Instagram.com/x/', 'http://instagram.com/x')).toBe(true)
    expect(linkForHref(layout, 'https://instagram.com/x')).toEqual({ nid: 'l1', index: 1, url: 'https://instagram.com/x' })
    expect(linkForHref(layout, 'https://example.com')).toBeNull()
  })
})
