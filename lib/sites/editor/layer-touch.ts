// The website builder's Layers on a phone (PROG-E6): a finger cannot hover, and HTML drag and drop never
// starts from a touch, so a block moves by a long press (lib/builder/gesture.ts) and then a drag. Each place a
// block can land carries its target as data on the element, the same target the mouse drop uses, so the
// shell reads where the finger is with one lookup and the two ways of moving cannot drift apart. Pure.

/** Where a dropped block lands: a top-level index, or an index inside one slot of a block. */
export type LayerDropTarget = { parentId: string | null; slotKey: string | null; index: number }

/** The attributes that mark an element as a landing place. `key` is what the drop marker lights. */
export function layerDropAttrs(key: string, target: LayerDropTarget): { 'data-drop-key': string; 'data-drop-at': string } {
  return { 'data-drop-key': key, 'data-drop-at': JSON.stringify(target) }
}

/** The landing place at (or around) an element, or null when the finger is not over one. */
export function readLayerDrop(el: Element | null): { key: string; target: LayerDropTarget } | null {
  const host = el?.closest<HTMLElement>('[data-drop-at]')
  const key = host?.dataset.dropKey
  if (!host || !key) return null
  try {
    const raw = JSON.parse(host.dataset.dropAt ?? '') as Partial<LayerDropTarget>
    const parentId = typeof raw.parentId === 'string' ? raw.parentId : null
    const slotKey = typeof raw.slotKey === 'string' ? raw.slotKey : null
    if (typeof raw.index !== 'number' || !Number.isInteger(raw.index) || raw.index < 0) return null
    return { key, target: { parentId, slotKey, index: raw.index } }
  } catch {
    return null
  }
}

/** A block cannot land on itself or inside itself as the parent; the data layer refuses deeper nesting. */
export function canDropLayer(id: string, drop: { key: string; target: LayerDropTarget }): boolean {
  return drop.key !== id && drop.target.parentId !== id
}

/** Only a finger or a pen takes the long press; a mouse keeps the HTML drag it already has. */
export function isTouchPress(pointerType: string): boolean {
  return pointerType === 'touch' || pointerType === 'pen'
}
