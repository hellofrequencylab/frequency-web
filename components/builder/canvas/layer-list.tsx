'use client'

// THE LAYER LIST (PROG-E6A): the page's sections as a reorderable list. A finger arms a drag with a long press on the
// row or a tap-and-drag on the grip; a keyboard moves a row with Alt+Arrow; the Up and Down buttons do the same with no
// gesture at all. Every target is 44px and nothing waits on hover. The math is lib/builder/gesture.ts; this is the wiring.
//
// THE LAYER TREE (PROG-E6B): given `tree`, the same rows are drawn nested as the page holds them, a row, its columns,
// and each column's blocks. A drag reorders a block inside its own column. Up, Down and Alt+Arrow do that too, and at
// a column's end they carry the block into the next column or row (lib/builder/canvas-tree.ts stepSlot), so every
// place on the page is reachable with no drag at all. Each move is reported as a slot through `onMove`.

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Button } from '@/components/ui/button'
import { stepSlot, type LayerSlot, type LayerTree } from '@/lib/builder/canvas-tree'
import { dropIndex, keyboardMove, LONG_PRESS_MS, longPressStep, reorder } from '@/lib/builder/gesture'

export type Layer = { id: string; label: string; hidden?: true }

/** One reorderable stack of rows: the whole flat list, or one column of the tree. `leave` says whether a row at
 *  this stack's top or bottom has somewhere further to go, and `onLeave` takes it there. */
function LayerRows({
  layers, onReorder, announce, selectedId, onSelect, leave, onLeave,
}: {
  layers: readonly Layer[]
  onReorder: (next: Layer[], id: string, at: number) => void
  announce: (words: string) => void
  selectedId?: string | null
  onSelect?: (id: string) => void
  leave?: { up: boolean; down: boolean }
  onLeave?: (id: string, by: -1 | 1) => void
}) {
  const [dragging, setDragging] = useState<number | null>(null)
  const [gap, setGap] = useState<number | null>(null)
  const press = useRef(longPressStep({ phase: 'idle' }, { type: 'up' }))
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const list = useRef<HTMLOListElement>(null)

  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null }
  useEffect(() => clear, [])

  const boxes = () => Array.from(list.current?.children ?? []).map((el) => { const r = el.getBoundingClientRect(); return { top: r.top, height: r.height } })
  const commit = (next: Layer[], at: number) => { onReorder(next, next[at].id, at); announce(`${next[at].label}, position ${at + 1} of ${next.length}`) }

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
  /** Past this stack's end: -1 or 1 when the row can leave that way, else 0. */
  const beyond = (index: number, by: -1 | 1): -1 | 0 | 1 => (onLeave && ((by < 0 && index === 0 && leave?.up) || (by > 0 && index === layers.length - 1 && leave?.down)) ? by : 0)
  const key = (index: number) => (e: KeyboardEvent) => {
    const next = keyboardMove(layers, index, e.key, e.altKey)
    const out = !next && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') ? beyond(index, e.key === 'ArrowUp' ? -1 : 1) : 0
    if (!next && !out) return
    e.preventDefault()
    if (next) commit(next, next.findIndex((l) => l.id === layers[index].id))
    else if (out) onLeave?.(layers[index].id, out)
  }
  const step = (index: number, by: -1 | 1) => {
    const next = keyboardMove(layers, index, by < 0 ? 'ArrowUp' : 'ArrowDown', true)
    if (next) commit(next, index + by)
    else if (beyond(index, by)) onLeave?.(layers[index].id, by)
  }

  return (
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
          <span className="min-w-0 flex-1 break-words" tabIndex={0} aria-label={`${layer.label}${layer.hidden ? ', hidden' : ''}, position ${i + 1} of ${layers.length}`}>
            {layer.label}
            {layer.hidden && <span className="ml-2 text-meta text-muted">Hidden</span>}
          </span>
          {onSelect && (
            <Button type="button" size="sm" variant={selectedId === layer.id ? 'primary' : 'secondary'} className="min-h-11 min-w-11" aria-pressed={selectedId === layer.id} aria-label={`Edit ${layer.label}`} onClick={() => onSelect(layer.id)}>Edit</Button>
          )}
          <Button type="button" size="sm" variant="secondary" className="min-h-11 min-w-11" aria-label={`Move ${layer.label} up`} disabled={i === 0 && !beyond(i, -1)} onClick={() => step(i, -1)}>Up</Button>
          <Button type="button" size="sm" variant="secondary" className="min-h-11 min-w-11" aria-label={`Move ${layer.label} down`} disabled={i === layers.length - 1 && !beyond(i, 1)} onClick={() => step(i, 1)}>Down</Button>
        </li>
      ))}
    </ol>
  )
}

/** With `onSelect`, each row also carries an Edit button that picks that layer for the inspector (PROG-E5B).
 *  With `tree` and `onMove`, the rows are nested by row and column and a move is a slot in that tree (PROG-E6B);
 *  `layers` and `onChange` are then not used. */
export function LayerList({
  layers, onChange, selectedId, onSelect, tree, onMove,
}: {
  layers: readonly Layer[]
  onChange: (next: Layer[]) => void
  selectedId?: string | null
  onSelect?: (id: string) => void
  tree?: LayerTree
  onMove?: (id: string, to: LayerSlot) => void
}) {
  const [say, setSay] = useState('')
  const root = useRef<HTMLElement>(null)
  // A block carried into another column is drawn again there: put the keyboard back on it.
  const refocus = useRef<string | null>(null)
  useEffect(() => {
    if (!refocus.current) return
    root.current?.querySelector<HTMLElement>(`[data-layer="${refocus.current}"] [tabindex]`)?.focus()
    refocus.current = null
  })

  const nested = tree && onMove ? tree : null
  const columns = nested?.flatMap((row) => row.columns.map((_, col) => `${row.id}:${col}`)) ?? []
  const carry = (id: string, by: -1 | 1) => {
    const to = nested && stepSlot(nested, id, by)
    if (!to || !onMove) return
    const row = nested.find((r) => r.id === to.rowId)
    refocus.current = id
    onMove(id, to)
    setSay(`Moved to ${row?.label ?? 'another row'}${row && row.columns.length > 1 ? `, column ${to.col + 1}` : ''}`)
  }

  return (
    <section ref={root} aria-label="Layers" className="space-y-2">
      <h2 className="text-body-sm font-semibold">Layers</h2>
      {nested ? (
        <>
          <p className="text-meta text-muted">Press and hold a block, then drag it within its column. Up and Down, or Alt and the arrow keys, also carry it into the next column or row.</p>
          <ol className="space-y-3" data-layer-tree="">
            {nested.map((row) => (
              <li key={row.id} data-layer-row={row.id} className="space-y-1">
                <h3 className="text-meta font-semibold text-muted">{row.label}</h3>
                <ol className={row.columns.length > 1 ? 'grid gap-2 border-l border-border pl-3 md:grid-cols-2' : 'border-l border-border pl-3'}>
                  {row.columns.map((stack, col) => {
                    const at = columns.indexOf(`${row.id}:${col}`)
                    return (
                      <li key={col} data-layer-column={col} className="min-w-0 space-y-1">
                        {row.columns.length > 1 && <h4 className="text-meta text-muted">Column {col + 1}</h4>}
                        {stack.length === 0 && <p className="text-meta text-muted">Empty. Move a block here with Up or Down.</p>}
                        <LayerRows
                          layers={stack}
                          onReorder={(_next, id, index) => onMove?.(id, { rowId: row.id, col, index })}
                          announce={setSay}
                          selectedId={selectedId}
                          onSelect={onSelect}
                          leave={{ up: at > 0, down: at < columns.length - 1 }}
                          onLeave={carry}
                        />
                      </li>
                    )
                  })}
                </ol>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <>
          <p className="text-meta text-muted">Press and hold a row, then drag. On a keyboard, Alt and the arrow keys move it.</p>
          <LayerRows layers={layers} onReorder={(next) => onChange(next)} announce={setSay} selectedId={selectedId} onSelect={onSelect} />
        </>
      )}
      <p role="status" aria-live="polite" className="sr-only">{say}</p>
    </section>
  )
}
