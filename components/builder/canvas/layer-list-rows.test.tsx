// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { LayerTree } from '@/lib/builder/canvas-tree'
import { LayerList } from './layer-list'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// PROG-E6D. Each row of the tree carries its own tools when the page can change: Up, Down, a column picker that will
// not drop a column holding blocks, Add a row below, and Remove row on an empty row only.

const TREE: LayerTree = [
  { id: 'r1', label: 'Welcome', split: 'even', columns: [[{ id: 'a', label: 'Banner' }], [{ id: 'b', label: 'Story' }]] },
  { id: 'r2', label: 'Row 2', split: 'full', columns: [[]] },
]
const list = (onRow?: () => void) => <LayerList layers={[]} onChange={vi.fn()} tree={TREE} onMove={vi.fn()} onRow={onRow} />

describe('row tools', () => {
  it('are absent when the page cannot change', () => {
    expect(renderToStaticMarkup(list())).not.toContain('data-row-tools')
  })
  it('give every row Up, Down, columns and Add, at 44px, off at the ends', () => {
    const html = renderToStaticMarkup(list(vi.fn()))
    expect(html.match(/data-row-tools/g)).toHaveLength(2)
    expect(html).toMatch(/disabled=""[^>]*aria-label="Move Welcome up"/)
    expect(html).toMatch(/disabled=""[^>]*aria-label="Move Row 2 down"/)
    expect(html).not.toMatch(/disabled=""[^>]*aria-label="Move Welcome down"/)
    expect(html).toContain('aria-label="Columns in Welcome"')
    expect(html.match(/Add a row below/g)).toHaveLength(2)
    expect(html).toMatch(/min-h-11[^>]*>Add a row below/)
  })
  it('will not pick a split that drops a column holding blocks, and only an empty row can be removed', () => {
    const html = renderToStaticMarkup(list(vi.fn()))
    const welcome = html.slice(html.indexOf('aria-label="Columns in Welcome"'), html.indexOf('</select>'))
    expect(welcome).toMatch(/<option value="full" disabled="">One column<\/option>/)
    expect(welcome).toMatch(/<option value="sidebar">Wide right<\/option>/)
    expect(html).not.toContain('aria-label="Remove Welcome"')
    expect(html).toContain('aria-label="Remove Row 2"')
  })
  it('sends each row change and says what happened', async () => {
    const onRow = vi.fn()
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => root.render(list(onRow)))
    const click = (selector: string) => act(async () => host.querySelector<HTMLButtonElement>(selector)!.click())
    await click('[aria-label="Move Welcome down"]')
    await click('[aria-label="Remove Row 2"]')
    const add = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Add a row below')!
    await act(async () => add.click())
    const picker = host.querySelector<HTMLSelectElement>('[aria-label="Columns in Welcome"]')!
    await act(async () => {
      picker.value = 'lead'
      picker.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onRow.mock.calls.map(([change]) => change)).toEqual([
      { kind: 'row-move', rowId: 'r1', by: 1 },
      { kind: 'row-remove', rowId: 'r2' },
      { kind: 'row-add', at: 1 },
      { kind: 'row-split', rowId: 'r1', split: 'lead' },
    ])
    expect(host.querySelector('[role="status"]')!.textContent).toBe('Welcome: Wide left')
    await act(async () => root.unmount())
  })
})
