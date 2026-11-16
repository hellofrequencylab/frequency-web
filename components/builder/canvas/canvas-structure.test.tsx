// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LayerTree } from '@/lib/builder/canvas-tree'
import { BlockInserter } from './block-inserter'
import { LayerList } from './layer-list'
import { SpacingHandles } from './spacing-handles'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// PROG-E6B. The three controls that change a page's shape, driven the way a person drives them: a button, a key,
// a drag. Each reports a slot, a named step or an id; none of them reports a length.

const TREE: LayerTree = [
  { id: 'r1', label: 'Row 1', columns: [[{ id: 'a', label: 'Callout' }, { id: 'b', label: 'Paragraph' }]] },
  { id: 'r2', label: 'Side by side', columns: [[{ id: 'c', label: 'Banner' }], []] },
]

let root: ReturnType<typeof createRoot> | null = null
let host: HTMLElement
const mount = async (ui: React.ReactNode) => {
  host = document.body.appendChild(document.createElement('div'))
  root = createRoot(host)
  await act(async () => root!.render(ui))
}
afterEach(async () => { await act(async () => root?.unmount()); root = null; host?.remove() })
const click = (el: Element | null) => act(async () => { el!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const press = (el: Element | null, key: string, altKey = false) => act(async () => { el!.dispatchEvent(new KeyboardEvent('keydown', { key, altKey, bubbles: true, cancelable: true })) })
const pointer = (el: Element | null, type: string, clientY: number) => act(async () => { el!.dispatchEvent(new MouseEvent(type, { bubbles: true, clientY })) })
const button = (label: string) => host.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement

describe('the layer tree', () => {
  it('draws the page nested: a row, its columns, and each column of blocks, with an empty column said plainly', () => {
    const html = renderToStaticMarkup(<LayerList layers={[]} onChange={vi.fn()} tree={TREE} onMove={vi.fn()} selectedId="c" onSelect={vi.fn()} />)
    expect(html).toContain('data-layer-tree')
    expect(html.indexOf('Row 1')).toBeLessThan(html.indexOf('data-layer="a"'))
    expect(html.indexOf('data-layer="b"')).toBeLessThan(html.indexOf('Side by side'))
    expect(html).toContain('Column 1')
    expect(html).toContain('Column 2')
    expect(html).toContain('Empty. Move a block here')
    // A one-column row does not pretend to have columns.
    expect(html.split('data-layer-row="r2"')[0]).not.toContain('Column 1')
    expect(html).toMatch(/aria-pressed="true"[^>]*aria-label="Edit Banner"/)
    expect(html).not.toMatch(/hover:/)
  })

  it('stays the flat list without a tree, exactly as before', () => {
    const html = renderToStaticMarkup(<LayerList layers={[{ id: 'a', label: 'Banner' }, { id: 'b', label: 'Story' }]} onChange={vi.fn()} />)
    expect(html).not.toContain('data-layer-tree')
    expect(html).toContain('Press and hold a row')
    expect(html).toMatch(/disabled=""[^>]*aria-label="Move Banner up"/)
  })

  it('reports a move inside a column as a slot, from the Down button and from Alt and an arrow key', async () => {
    const onMove = vi.fn()
    await mount(<LayerList layers={[]} onChange={vi.fn()} tree={TREE} onMove={onMove} />)
    await click(button('Move Callout down'))
    expect(onMove).toHaveBeenLastCalledWith('a', { rowId: 'r1', col: 0, index: 1 })
    await press(host.querySelector('[data-layer="b"]'), 'ArrowUp', true)
    expect(onMove).toHaveBeenLastCalledWith('b', { rowId: 'r1', col: 0, index: 0 })
    await press(host.querySelector('[data-layer="b"]'), 'ArrowUp')
    expect(onMove).toHaveBeenCalledTimes(2)
  })

  it('carries a block past the end of its column into the next one, and says where it went', async () => {
    const onMove = vi.fn()
    await mount(<LayerList layers={[]} onChange={vi.fn()} tree={TREE} onMove={onMove} />)
    // Top of the page: nowhere further up. Bottom of a column that is not the last: somewhere to go.
    expect(button('Move Callout up').disabled).toBe(true)
    expect(button('Move Paragraph down').disabled).toBe(false)
    await click(button('Move Paragraph down'))
    expect(onMove).toHaveBeenLastCalledWith('b', { rowId: 'r2', col: 0, index: 0 })
    await click(button('Move Banner down'))
    expect(onMove).toHaveBeenLastCalledWith('c', { rowId: 'r2', col: 1, index: 0 })
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Moved to Side by side, column 2')
    await press(host.querySelector('[data-layer="c"]'), 'ArrowUp', true)
    expect(onMove).toHaveBeenLastCalledWith('c', { rowId: 'r1', col: 0, index: 2 })
  })
})

describe('spacing handles', () => {
  const handle = (edge: string) => host.querySelector(`[data-spacing-handle="${edge}"]`) as HTMLElement

  it('draws three sliders around the block, each saying its step in words', async () => {
    await mount(<SpacingHandles style={{ mt: 'lg', pad: 'sm' }} onChange={vi.fn()}><p>Block</p></SpacingHandles>)
    expect(handle('mt').getAttribute('role')).toBe('slider')
    expect(handle('mt').getAttribute('aria-label')).toBe('Space above')
    expect(handle('mt').getAttribute('aria-valuetext')).toBe('Large')
    expect(handle('pad').getAttribute('aria-valuetext')).toBe('Small')
    expect(handle('mb').getAttribute('aria-valuetext')).toBe('Default')
    expect(handle('mb').textContent).toBe('Space below: Default')
    expect(host.textContent).toContain('Block')
  })

  it('walks the named steps from the keyboard and stops at the ends', async () => {
    const onChange = vi.fn()
    await mount(<SpacingHandles style={{ mt: 'lg' }} onChange={onChange}><p>Block</p></SpacingHandles>)
    await press(handle('mt'), 'ArrowUp')
    expect(onChange).toHaveBeenLastCalledWith('mt', 'xl')
    await press(handle('mt'), 'ArrowDown')
    expect(onChange).toHaveBeenLastCalledWith('mt', 'md')
    await press(handle('mt'), 'Home')
    expect(onChange).toHaveBeenLastCalledWith('mt', 'none')
    await press(handle('pad'), 'End')
    expect(onChange).toHaveBeenLastCalledWith('pad', 'lg')
    onChange.mockClear()
    await press(handle('pad'), 'ArrowDown')
    await press(handle('mt'), 'a')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('turns a drag into one change on release, and only ever a named step', async () => {
    const onChange = vi.fn()
    await mount(<SpacingHandles style={undefined} onChange={onChange}><p>Block</p></SpacingHandles>)
    await pointer(handle('mb'), 'pointerdown', 100)
    await pointer(handle('mb'), 'pointermove', 120)
    await pointer(handle('mb'), 'pointermove', 137)
    // Shown while dragging, not yet reported.
    expect(handle('mb').getAttribute('aria-valuetext')).toBe('Medium')
    expect(onChange).not.toHaveBeenCalled()
    await pointer(handle('mb'), 'pointerup', 137)
    expect(onChange.mock.calls).toEqual([['mb', 'md']])
    // A drag far past the end lands on the last step, not on a distance.
    await pointer(handle('pad'), 'pointerdown', 0)
    await pointer(handle('pad'), 'pointermove', 4000)
    await pointer(handle('pad'), 'pointerup', 4000)
    expect(onChange).toHaveBeenLastCalledWith('pad', 'lg')
    // A press with no travel changes nothing.
    onChange.mockClear()
    await pointer(handle('mt'), 'pointerdown', 50)
    await pointer(handle('mt'), 'pointerup', 50)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows the steps but takes no change on a read-only page', async () => {
    const onChange = vi.fn()
    await mount(<SpacingHandles style={{ mt: 'sm' }} onChange={onChange} readOnly><p>Block</p></SpacingHandles>)
    expect(handle('mt').getAttribute('aria-disabled')).toBe('true')
    await press(handle('mt'), 'ArrowUp')
    await pointer(handle('mt'), 'pointerdown', 0)
    await pointer(handle('mt'), 'pointermove', 80)
    await pointer(handle('mt'), 'pointerup', 80)
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('the inserter', () => {
  const INSERTER = {
    presets: [{ id: 'welcome', label: 'Welcome note', say: 'A headline, a few lines and a button.' }, { id: 'big-title', label: 'Big title', say: 'A large heading.', disabled: true as const, reason: 'This page already has as many of these as it can hold.' }],
    blanks: [{ id: 'callout', label: 'Callout' }, { id: 'prose', label: 'Text Block' }],
  }

  it('puts the presets first and open, and the blank blocks behind them', async () => {
    await mount(<BlockInserter inserter={INSERTER} under="Callout" off={null} onInsert={vi.fn()} />)
    const presets = host.querySelector('[data-inserter="presets"]')!
    const blanks = host.querySelector('[data-inserter="blanks"]')!
    expect(presets.compareDocumentPosition(blanks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(blanks.tagName).toBe('DETAILS')
    expect((blanks as HTMLDetailsElement).open).toBe(false)
    expect(host.textContent).toContain('It goes in under Callout')
    expect(host.textContent).toContain('A headline, a few lines and a button.')
  })

  it('asks for a preset or a blank block by id, and keeps a block at its limit switched off with the reason', async () => {
    const onInsert = vi.fn()
    await mount(<BlockInserter inserter={INSERTER} under="Callout" off={null} onInsert={onInsert} />)
    const preset = (label: string) => Array.from(host.querySelectorAll('[data-inserter="presets"] button')).find((b) => b.textContent === label) as HTMLButtonElement
    await click(preset('Welcome note'))
    expect(onInsert).toHaveBeenLastCalledWith('preset', 'welcome')
    await click(button('Add a blank Text Block'))
    expect(onInsert).toHaveBeenLastCalledWith('blank', 'prose')
    expect(preset('Big title').disabled).toBe(true)
    expect(host.textContent).toContain('as many of these as it can hold')
    expect(preset('Welcome note').className).toContain('min-h-11')
  })

  it('is switched off, with the reason, when nothing can be added', async () => {
    await mount(<BlockInserter inserter={INSERTER} under="Callout" off="This page is read only here, so nothing can be added." onInsert={vi.fn()} />)
    expect(host.textContent).toContain('read only')
    expect(Array.from(host.querySelectorAll('button')).every((b) => b.disabled)).toBe(true)
  })
})
