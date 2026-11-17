// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { LayerTree } from '@/lib/builder/canvas-tree'
import { CanvasPagePreview, plainWords, previewColumns, type PreviewBlock } from './canvas-page-preview'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// PROG-E6E. The frame draws the whole page: every block, row by row at the row's split, one column on a phone, and a
// tap on a block selects it.

const WORDS = [{ key: 'title', label: 'Title', kind: 'text' as const }, { key: 'body', label: 'Body', kind: 'textarea' as const }]
const TREE: LayerTree = [
  { id: 'r1', label: 'Row 1', split: 'full', columns: [[{ id: 'a', label: 'Callout' }]] },
  { id: 'r2', label: 'Row 2', split: 'lead', columns: [[{ id: 'b', label: 'Story' }], [{ id: 'c', label: 'Quote', hidden: true }]] },
]
const BLOCKS = new Map<string, PreviewBlock>([
  ['a', { title: 'Callout', fields: WORDS, node: { content: { title: 'Come <b>in</b>', body: 'Sundays' }, responsive: { phone: { title: 'Hi' } } } }],
  ['b', { title: 'Story', fields: WORDS, node: { content: { title: 'How it started' } } }],
  ['c', { title: 'Quote', fields: [], node: {} }],
])
const draw = (device: 'desktop' | 'phone', selectedId: string | null = 'a', onSelect = vi.fn()) => (
  <CanvasPagePreview tree={TREE} blocks={BLOCKS} device={device} selectedId={selectedId} onSelect={onSelect} renderSelected={(words) => <div data-handles="">{words}</div>} />
)

describe('the whole page in the frame', () => {
  it('draws every block in its row and column, with the words the device resolves to', () => {
    const html = renderToStaticMarkup(draw('desktop'))
    expect(html.match(/data-preview-block=/g)).toHaveLength(3)
    expect(html).toContain('Come in')
    expect(html).not.toContain('<b>')
    expect(html).toContain('How it started')
    expect(html).toContain('grid-template-columns:minmax(0, 2fr) minmax(0, 1fr)')
    expect(renderToStaticMarkup(draw('phone'))).toContain('>Hi<')
  })
  it('stacks every row in one column on a phone', () => {
    expect(renderToStaticMarkup(draw('phone')).match(/grid-template-columns:minmax\(0, 1fr\)[;"]/g)).toHaveLength(2)
    expect([previewColumns('even', 2, 'desktop'), previewColumns('sidebar', 2, 'tablet'), previewColumns('full', 1, 'desktop')])
      .toEqual(['repeat(2, minmax(0, 1fr))', 'minmax(0, 1fr) minmax(0, 2fr)', 'minmax(0, 1fr)'])
  })
  it('draws the selected block through its tools, and marks a hidden block but keeps it pickable', () => {
    const html = renderToStaticMarkup(draw('desktop'))
    expect(html).toMatch(/data-preview-block="a" data-selected=""[^>]*><div data-handles="">/)
    expect(html).toContain('aria-label="Edit Quote, hidden"')
    expect(html).toContain('Hidden on the page')
    expect(html).toMatch(/min-height:44px/)
  })
  it('selects a block when it is tapped', async () => {
    const onSelect = vi.fn()
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => root.render(draw('desktop', 'a', onSelect)))
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Edit Story"]')!.click())
    expect(onSelect).toHaveBeenCalledWith('b')
    await act(async () => root.unmount())
  })
  it('never lets a tag through as markup', () => {
    expect(plainWords('<scr<b>ipt>alert(1)</script>')).not.toContain('<')
  })
})
