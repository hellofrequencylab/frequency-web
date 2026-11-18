// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { canDropLayer, isTouchPress, layerDropAttrs, readLayerDrop } from './layer-touch'

function host(attrs: Record<string, string>) {
  const el = document.createElement('div')
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value)
  const child = document.createElement('span'); el.append(child)
  return child
}

describe('layer touch drop targets', () => {
  it('reads back the target it wrote, from a child of the marked element', () => {
    const target = { parentId: 'cols', slotKey: 'right', index: 2 }
    expect(readLayerDrop(host(layerDropAttrs('cols:right', target)))).toEqual({ key: 'cols:right', target })
    expect(readLayerDrop(host(layerDropAttrs('a', { parentId: null, slotKey: null, index: 0 })))).toEqual({ key: 'a', target: { parentId: null, slotKey: null, index: 0 } })
  })
  it('finds nothing off a landing place or on a broken one', () => {
    expect(readLayerDrop(null)).toBeNull()
    expect(readLayerDrop(document.createElement('div'))).toBeNull()
    expect(readLayerDrop(host({ 'data-drop-key': 'a', 'data-drop-at': '{' }))).toBeNull()
    expect(readLayerDrop(host({ 'data-drop-key': 'a', 'data-drop-at': '{"index":-1}' }))).toBeNull()
  })
  it('refuses a block landing on itself or as its own parent', () => {
    expect(canDropLayer('a', { key: 'a', target: { parentId: null, slotKey: null, index: 0 } })).toBe(false)
    expect(canDropLayer('a', { key: 'a:left', target: { parentId: 'a', slotKey: 'left', index: 0 } })).toBe(false)
    expect(canDropLayer('a', { key: 'b', target: { parentId: null, slotKey: null, index: 1 } })).toBe(true)
  })
  it('takes a finger or a pen, not a mouse', () => {
    expect([isTouchPress('touch'), isTouchPress('pen'), isTouchPress('mouse')]).toEqual([true, true, false])
  })
})
