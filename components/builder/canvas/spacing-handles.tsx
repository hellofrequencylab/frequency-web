'use client'

// SPACING HANDLES ON THE SELECTED BLOCK (PROG-E6B). Drawn inside the canvas frame around the block the inspector
// is on: a handle above it (space above), one inside its top edge (padding) and one below it (space below).
//
// A handle is a slider over NAMED STEPS, the ones the document already stores on a block (`style.mt`, `style.pad`,
// `style.mb`). Dragging it counts steps and the arrow keys walk them; no length ever leaves this file, so the
// document can only hold a step the page's own stylesheet knows. Each handle is 44px tall, drags from the first
// touch (it is a grip, so there is no scroll to protect and no long press) and never waits on hover.
//
// The frame has no stylesheet, so the look is inline and colourless: the text colour at part strength. The bands
// here are an editor's sketch of the space, sized per step, not the page's exact spacing.

import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { dragSpacing, SPACING_EDGE_WORDS, SPACING_SCALE, spacingStepOf, spacingWord, stepSpacing, type SpacingEdge, type SpacingStep } from '@/lib/builder/canvas-tree'
import type { BlockNode } from '@/lib/entity-blocks/node-tree'

/** How much taller than its 44px grip the sketch draws a step, in rem. Editor only. */
const SKETCH: Record<SpacingStep, number> = { none: 0, default: 0.5, sm: 1, md: 2, lg: 3, xl: 5 }

const GRIP: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'flex-start', padding: '0 0.75rem', boxSizing: 'border-box',
  border: '1px dashed currentColor', borderRadius: '0.5rem', opacity: 0.75, cursor: 'ns-resize', touchAction: 'none', userSelect: 'none',
}

export function SpacingHandles({
  style, onChange, readOnly, children,
}: {
  style: BlockNode['style']
  onChange: (edge: SpacingEdge, step: SpacingStep) => void
  readOnly?: boolean
  children: ReactNode
}) {
  // A drag in progress: which handle, where it started, and the step it is over now. Committed on release.
  const [drag, setDrag] = useState<{ edge: SpacingEdge; from: SpacingStep; y: number; step: SpacingStep } | null>(null)
  const dragging = useRef(drag)
  const hold = (next: typeof drag) => { dragging.current = next; setDrag(next) }

  const stepOf = (edge: SpacingEdge) => (drag?.edge === edge ? drag.step : spacingStepOf(style, edge))
  const down = (edge: SpacingEdge) => (e: PointerEvent<HTMLDivElement>) => {
    if (readOnly) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const from = spacingStepOf(style, edge)
    hold({ edge, from, y: e.clientY, step: from })
  }
  const move = (e: PointerEvent) => {
    const now = dragging.current
    if (now) hold({ ...now, step: dragSpacing(now.edge, now.from, e.clientY - now.y) })
  }
  const up = () => {
    const now = dragging.current
    hold(null)
    if (now && now.step !== now.from) onChange(now.edge, now.step)
  }
  const key = (edge: SpacingEdge) => (e: KeyboardEvent) => {
    if (readOnly) return
    const scale = SPACING_SCALE[edge]
    const from = spacingStepOf(style, edge)
    const to = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? stepSpacing(edge, from, 1)
      : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? stepSpacing(edge, from, -1)
      : e.key === 'Home' ? scale[0]! : e.key === 'End' ? scale[scale.length - 1]! : null
    if (to === null) return
    e.preventDefault()
    if (to !== from) onChange(edge, to)
  }

  const handle = (edge: SpacingEdge) => {
    const step = stepOf(edge)
    const scale = SPACING_SCALE[edge]
    return (
      <div
        role="slider"
        tabIndex={0}
        aria-label={SPACING_EDGE_WORDS[edge]}
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={scale.length - 1}
        aria-valuenow={scale.indexOf(step)}
        aria-valuetext={spacingWord(edge, step)}
        aria-disabled={readOnly || undefined}
        data-spacing-handle={edge}
        data-spacing-step={step}
        style={{ ...GRIP, height: `${2.75 + SKETCH[step]}rem` }}
        onPointerDown={down(edge)}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={key(edge)}
      >
        <small>{SPACING_EDGE_WORDS[edge]}: {spacingWord(edge, step)}</small>
      </div>
    )
  }

  return (
    <div data-spacing-handles="">
      {handle('mt')}
      <div style={{ padding: `${SKETCH[stepOf('pad')] / 2}rem` }}>
        {handle('pad')}
        {children}
      </div>
      {handle('mb')}
      <p><small>Drag a handle down for more space and up for less, or use the arrow keys on it. Each stop is a named step.</small></p>
    </div>
  )
}
