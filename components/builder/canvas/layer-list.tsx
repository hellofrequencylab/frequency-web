'use client'

// THE LAYER LIST (PROG-E6A): the page's sections as a reorderable list. A finger arms a drag with a long press on the
// row or a tap-and-drag on the grip; a keyboard moves a row with Alt+Arrow; the Up and Down buttons do the same with no
// gesture at all. Every target is 44px and nothing waits on hover. The math is lib/builder/gesture.ts; this is the wiring.

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Button } from '@/components/ui/button'
import { dropIndex, keyboardMove, LONG_PRESS_MS, longPressStep, reorder } from '@/lib/builder/gesture'

export type Layer = { id: string; label: string }

export function LayerList({ layers, onChange }: { layers: readonly Layer[]; onChange: (next: Layer[]) => void }) {
  const [dragging, setDragging] = useState<number | null>(null)
  const [gap, setGap] = useState<number | null>(null)
  const [say, setSay] = useState('')
  const press = useRef(longPressStep({ phase: 'idle' }, { type: 'up' }))
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const list = useRef<HTMLOListElement>(null)

  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null }
  useEffect(() => clear, [])

  const boxes = () => Array.from(list.current?.children ?? []).map((el) => { const r = el.getBoundingClientRect(); return { top: r.top, height: r.height } })
  const commit = (next: Layer[], at: number) => { onChange(next); setSay(`${next[at].label}, position ${at + 1} of ${next.length}`) }

  const start = (index: number) => (e: PointerEvent) => {
    press.current = longPressStep(press.current, { type: 'down', x: e.clientX, y: e.clientY, at: e.timeStamp })
    const armAt = e.timeStamp + LONG_PRESS_MS
    timer.current = setTimeout(() => {
      press.current = longPressStep(press.current, { type: 'tick', at: armAt })
      if (press.current.phase === 'armed') { setDragging(index); setGap(index) }
    }, LONG_PRESS_MS)
  }
  const move = (e: PointerEvent) => {
    press.current = longPressStep(press.current, { type: 'move', x: e.clientX, y: e.clientY, at: e.timeStamp })
    if (press.current.phase === 'cancelled') clear()
    if (press.current.phase === 'armed' && dragging !== null) setGap(dropIndex(boxes(), e.clientY))
  }
  const end = () => {
    clear()
    if (dragging !== null && gap !== null) {
      const next = reorder(layers, dragging, gap)
      const at = next.findIndex((l) => l.id === layers[dragging].id)
      if (at !== dragging) commit(next, at)
    }
    press.current = longPressStep(press.current, { type: 'up' })
    setDragging(null)
    setGap(null)
  }
  const key = (index: number) => (e: KeyboardEvent) => {
    const next = keyboardMove(layers, index, e.key, e.altKey)
    if (!next) return
    e.preventDefault()
    commit(next, next.findIndex((l) => l.id === layers[index].id))
  }
  const step = (index: number, by: -1 | 1) => {
    const next = keyboardMove(layers, index, by < 0 ? 'ArrowUp' : 'ArrowDown', true)
    if (next) commit(next, index + by)
  }

  return (
    <section aria-label="Layers" className="space-y-2">
      <h2 className="text-body-sm font-semibold">Layers</h2>
      <p className="text-meta text-muted">Press and hold a row, then drag. On a keyboard, Alt and the arrow keys move it.</p>
      <ol ref={list} className="space-y-1">
        {layers.map((layer, i) => (
          <li
            key={layer.id}
            data-layer={layer.id}
            data-dragging={dragging === i ? '' : undefined}
            data-drop-before={dragging !== null && gap === i && gap !== dragging ? '' : undefined}
            className="flex min-h-11 items-center gap-2 rounded-control border border-border bg-surface px-3 data-[dragging]:opacity-60 data-[drop-before]:border-t-2 data-[drop-before]:border-t-primary"
            style={{ touchAction: dragging === null ? 'pan-y' : 'none' }}
            onPointerDown={start(i)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onKeyDown={key(i)}
          >
            <span className="flex-1" tabIndex={0} aria-label={`${layer.label}, position ${i + 1} of ${layers.length}`}>{layer.label}</span>
            <Button type="button" size="sm" variant="secondary" className="min-h-11 min-w-11" aria-label={`Move ${layer.label} up`} disabled={i === 0} onClick={() => step(i, -1)}>Up</Button>
            <Button type="button" size="sm" variant="secondary" className="min-h-11 min-w-11" aria-label={`Move ${layer.label} down`} disabled={i === layers.length - 1} onClick={() => step(i, 1)}>Down</Button>
          </li>
        ))}
      </ol>
      <p role="status" aria-live="polite" className="sr-only">{say}</p>
    </section>
  )
}
