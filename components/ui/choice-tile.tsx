import { cn } from '@/lib/utils'

// CHOICE TILE (SCAN-1133). A selectable card or row: the whole box is the choice (a plan, an
// opt-in, a view mode), so it is bigger than a chip and carries its own padding and corners from
// the caller. Selected = the brand outline and a soft wash; it is a state, never the action fill,
// which stays `buttonClasses('primary')`. Pair it with `aria-pressed` / `role="radio"` so the state
// is announced, not only painted. A single small pill uses `chipClasses` instead.
const BASE = 'border transition-colors motion-reduce:transition-none disabled:opacity-60'
const SELECTED = 'border-primary bg-primary-bg/40'
const IDLE = 'border-border bg-surface hover:bg-surface-elevated'

export function choiceTileClasses(selected: boolean, className?: string): string {
  return cn(BASE, selected ? SELECTED : IDLE, className)
}
