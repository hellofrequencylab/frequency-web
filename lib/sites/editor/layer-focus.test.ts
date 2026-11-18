import { describe, expect, it } from 'vitest'
import { flattenLayers, layerShortcut, layerTabStop, nextLayerFocus, planLayerKey, type LayerNode } from './layer-focus'

const leaf = (id: string): LayerNode => ({ id, slots: [] })
// hero, then a two column row holding a and b on the left and c on the right, then footer-cta
const tree: LayerNode[] = [leaf('hero'), { id: 'row', slots: [{ children: [leaf('a'), leaf('b')] }, { children: [leaf('c')] }] }, leaf('cta')]
const rows = flattenLayers(tree)
const key = (k: string, extra: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({ key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...extra })

describe('flattenLayers', () => {
  it('lists every block in reading order, with the block that holds it and its depth', () => {
    expect(rows).toEqual([
      { id: 'hero', parent: null, depth: 0 },
      { id: 'row', parent: null, depth: 0 },
      { id: 'a', parent: 'row', depth: 1 },
      { id: 'b', parent: 'row', depth: 1 },
      { id: 'c', parent: 'row', depth: 1 },
      { id: 'cta', parent: null, depth: 0 },
    ])
  })
})

describe('layerTabStop', () => {
  it('is the selected block when it is on the page, else the first row, else nothing', () => {
    expect(layerTabStop(rows, 'b')).toBe('b')
    expect(layerTabStop(rows, 'gone')).toBe('hero')
    expect(layerTabStop(rows, null)).toBe('hero')
    expect(layerTabStop([], 'b')).toBeNull()
  })
})

describe('nextLayerFocus', () => {
  it('steps through every row, nested ones included, and stops at the ends', () => {
    expect(nextLayerFocus(rows, 'row', 'ArrowDown')).toBe('a')
    expect(nextLayerFocus(rows, 'c', 'ArrowDown')).toBe('cta')
    expect(nextLayerFocus(rows, 'a', 'ArrowUp')).toBe('row')
    expect(nextLayerFocus(rows, 'cta', 'ArrowDown')).toBeNull()
    expect(nextLayerFocus(rows, 'hero', 'ArrowUp')).toBeNull()
  })
  it('jumps to the first and last row', () => {
    expect(nextLayerFocus(rows, 'b', 'Home')).toBe('hero')
    expect(nextLayerFocus(rows, 'b', 'End')).toBe('cta')
    expect(nextLayerFocus(rows, 'hero', 'Home')).toBeNull()
  })
  it('goes out to the holding block on Left and into its first block on Right', () => {
    expect(nextLayerFocus(rows, 'c', 'ArrowLeft')).toBe('row')
    expect(nextLayerFocus(rows, 'row', 'ArrowRight')).toBe('a')
    expect(nextLayerFocus(rows, 'hero', 'ArrowRight')).toBeNull()
    expect(nextLayerFocus(rows, 'hero', 'ArrowLeft')).toBeNull()
  })
  it('lands on the first row when the focused one has gone', () => {
    expect(nextLayerFocus(rows, 'gone', 'ArrowDown')).toBe('hero')
  })
})

describe('layerShortcut', () => {
  it('maps the section menu actions and leaves Alt to the move keys', () => {
    expect(layerShortcut(key('Delete'))).toBe('delete')
    expect(layerShortcut(key('Backspace'))).toBe('delete')
    expect(layerShortcut(key('d', { metaKey: true }))).toBe('copy')
    expect(layerShortcut(key('D', { ctrlKey: true }))).toBe('copy')
    expect(layerShortcut(key('H', { metaKey: true, shiftKey: true }))).toBe('hide')
    expect(layerShortcut(key('C', { shiftKey: true }))).toBe('comment')
    expect(layerShortcut(key('Delete', { altKey: true }))).toBeNull()
    expect(layerShortcut(key('d'))).toBeNull()
    expect(layerShortcut(key('Backspace', { metaKey: true }))).toBeNull()
  })
})

describe('planLayerKey', () => {
  it('moves with Alt, walks with plain arrows, and leaves other keys alone', () => {
    expect(planLayerKey(rows, 'row', 0, key('ArrowUp', { altKey: true }))).toEqual({ kind: 'move', direction: -1 })
    expect(planLayerKey(rows, 'row', 0, key('ArrowDown'))).toEqual({ kind: 'focus', id: 'a' })
    expect(planLayerKey(rows, 'cta', 0, key('ArrowDown'))).toBeNull()
    expect(planLayerKey(rows, 'row', 0, key('ArrowDown', { shiftKey: true }))).toBeNull()
    expect(planLayerKey(rows, 'row', 0, key('x'))).toBeNull()
  })
  it('hides top-level sections only', () => {
    expect(planLayerKey(rows, 'row', 0, key('h', { metaKey: true, shiftKey: true }))).toEqual({ kind: 'act', shortcut: 'hide', refocus: null })
    expect(planLayerKey(rows, 'a', 1, key('h', { metaKey: true, shiftKey: true }))).toBeNull()
  })
  it('after a removal, focus goes past the removed block and everything inside it', () => {
    expect(planLayerKey(rows, 'row', 0, key('Delete'))).toEqual({ kind: 'act', shortcut: 'delete', refocus: 'cta' })
    expect(planLayerKey(rows, 'cta', 0, key('Backspace'))).toEqual({ kind: 'act', shortcut: 'delete', refocus: 'c' })
    expect(planLayerKey(rows, 'b', 1, key('Delete'))).toEqual({ kind: 'act', shortcut: 'delete', refocus: 'c' })
  })
})
