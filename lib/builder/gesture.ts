// THE CANVAS GESTURE MODEL (PROG-E6A). PURE: no React, no DOM. A finger cannot hover, so a drag starts with a press
// that holds still (long press), and every drag has a keyboard twin. The layer list wires these thin.
//
//   • longPressStep: the press state machine (hold still LONG_PRESS_MS to arm; moving past the slop is a scroll).
//   • dropIndex: which gap a pointer is over, from the rows' measured boxes.
//   • reorder / keyboardMove: the new order, from a drag or from a key.

export const LONG_PRESS_MS = 400
/** A finger drifts a little while it holds; past this many px it is scrolling, not pressing. */
const LONG_PRESS_SLOP = 10

type PressState =
  | { phase: 'idle' }
  | { phase: 'pending'; x: number; y: number; at: number }
  | { phase: 'armed' }
  | { phase: 'cancelled' }

type PressInput =
  | { type: 'down'; x: number; y: number; at: number }
  | { type: 'move'; x: number; y: number; at: number }
  | { type: 'tick'; at: number }
  | { type: 'up' }

/** One step of the press. `armed` means the long press landed and the drag may begin. A move past the slop before it
 *  lands cancels, so the page scrolls instead; once armed, movement is the drag. */
export function longPressStep(state: PressState, input: PressInput): PressState {
  switch (input.type) {
    case 'down':
      return { phase: 'pending', x: input.x, y: input.y, at: input.at }
    case 'up':
      return { phase: 'idle' }
    case 'tick':
      return state.phase === 'pending' && input.at - state.at >= LONG_PRESS_MS ? { phase: 'armed' } : state
    case 'move': {
      if (state.phase !== 'pending') return state
      if (Math.hypot(input.x - state.x, input.y - state.y) > LONG_PRESS_SLOP) return { phase: 'cancelled' }
      return input.at - state.at >= LONG_PRESS_MS ? { phase: 'armed' } : state
    }
  }
}

type RowBox = Readonly<{ top: number; height: number }>

/** The gap (0 = above the first row, rows.length = below the last) a pointer at `y` is nearest, by row midpoints. */
export function dropIndex(rows: readonly RowBox[], y: number): number {
  let gap = 0
  for (const row of rows) {
    if (y > row.top + row.height / 2) gap += 1
    else break
  }
  return gap
}

/** Move the item at `from` into `gap` (a gap as dropIndex counts it, before the item leaves). */
export function reorder<T>(items: readonly T[], from: number, gap: number): T[] {
  if (from < 0 || from >= items.length) return [...items]
  const to = Math.max(0, Math.min(gap > from ? gap - 1 : gap, items.length - 1))
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}


/** The keyboard twin of a drag: Alt+Arrow moves one place, Alt+Home / Alt+End to the ends. Null when the key is not
 *  a move, or the item is already there (so the caller makes no edit and no undo step). */
export function keyboardMove<T>(items: readonly T[], from: number, key: string, alt: boolean): T[] | null {
  if (!alt || from < 0 || from >= items.length) return null
  const to = key === 'ArrowUp' ? from - 1 : key === 'ArrowDown' ? from + 1 : key === 'Home' ? 0 : key === 'End' ? items.length - 1 : null
  if (to === null || to < 0 || to >= items.length || to === from) return null
  return reorder(items, from, to > from ? to + 1 : to)
}
