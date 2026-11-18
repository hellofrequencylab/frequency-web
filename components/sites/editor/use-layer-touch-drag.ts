'use client'

import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { LONG_PRESS_MS, longPressStep } from '@/lib/builder/gesture'
import { canDropLayer, isTouchPress, readLayerDrop, type LayerDropTarget } from '@/lib/sites/editor/layer-touch'

type Options = {
  /** The landing place under the finger, by its drop key, or null to clear the marker. */
  onOver: (key: string | null) => void
  /** The finger lifted over a landing place the block may take. */
  onDrop: (id: string, target: LayerDropTarget, key: string) => void
}

/** Long press then drag for the Layers tree, wired once on the list around the rows (PROG-E6). The press
 *  starts on a row (`data-layer-id`); a move past the slop before it arms is a scroll and lets go. Once armed,
 *  the page stops scrolling, the row under the finger lights, and lifting drops there. */
export function useLayerTouchDrag({ onOver, onDrop }: Options) {
  const latest = useRef({ onOver, onDrop })
  useEffect(() => { latest.current = { onOver, onDrop } })
  const press = useRef(longPressStep({ phase: 'idle' }, { type: 'up' }))
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressed = useRef<string | null>(null)
  const over = useRef<{ key: string; target: LayerDropTarget } | null>(null)
  const swallowClick = useRef(false)
  const [dragging, setDragging] = useState<string | null>(null)

  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null }
  useEffect(() => clear, [])
  // Once armed the drag owns the finger: a touchmove the browser would scroll with is refused.
  useEffect(() => {
    if (!dragging) return
    const hold = (event: TouchEvent) => { if (event.cancelable) event.preventDefault() }
    document.addEventListener('touchmove', hold, { passive: false })
    return () => document.removeEventListener('touchmove', hold)
  }, [dragging])

  const reset = () => {
    clear()
    press.current = longPressStep(press.current, { type: 'up' })
    pressed.current = null
    over.current = null
    setDragging(null)
    latest.current.onOver(null)
  }

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    swallowClick.current = false
    if (!isTouchPress(event.pointerType)) return
    const id = (event.target as HTMLElement).closest<HTMLElement>('[data-layer-id]')?.dataset.layerId
    if (!id) return
    clear()
    pressed.current = id
    press.current = longPressStep(press.current, { type: 'down', x: event.clientX, y: event.clientY, at: event.timeStamp })
    const armAt = event.timeStamp + LONG_PRESS_MS
    timer.current = setTimeout(() => {
      press.current = longPressStep(press.current, { type: 'tick', at: armAt })
      if (press.current.phase === 'armed' && pressed.current) setDragging(pressed.current)
    }, LONG_PRESS_MS)
  }
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!pressed.current) return
    press.current = longPressStep(press.current, { type: 'move', x: event.clientX, y: event.clientY, at: event.timeStamp })
    if (press.current.phase === 'cancelled') { reset(); return }
    if (press.current.phase !== 'armed') return
    if (!dragging) setDragging(pressed.current)
    const drop = readLayerDrop(event.currentTarget.ownerDocument.elementFromPoint?.(event.clientX, event.clientY) ?? null)
    over.current = drop && canDropLayer(pressed.current, drop) ? drop : null
    latest.current.onOver(over.current?.key ?? null)
  }
  const onPointerUp = () => {
    const id = pressed.current, drop = over.current, armed = press.current.phase === 'armed'
    reset()
    if (!id || !armed) return
    swallowClick.current = true
    if (drop) latest.current.onDrop(id, drop.target, drop.key)
  }
  // The click that follows a drag is not a pick; the long press menu is not wanted on a row.
  const onClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (!swallowClick.current) return
    swallowClick.current = false
    event.preventDefault(); event.stopPropagation()
  }
  const onContextMenu = (event: MouseEvent<HTMLElement>) => { if (pressed.current) event.preventDefault() }

  return {
    dragging,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: reset, onClickCapture, onContextMenu, style: { touchAction: dragging ? 'none' : 'pan-y' } as const },
  }
}
