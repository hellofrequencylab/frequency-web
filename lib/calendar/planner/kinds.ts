import type { PlannerKind, PlannerLayer } from './types'

// THE PRESENTATION TABLE (calendar redesign README section 6), as data. One table, applied to chips,
// timed cards, agenda rows, list stage pills, board column tiles, timeline bars and the Show tiles.
//
// Every value is a CSS string built from theme tokens, so it follows Commons night by itself. Text
// always uses `fg`. The violet and the production blue are the two fixed accents the design tokens
// did not carry; they live in app/globals.css as --color-cal-works and --cal-production.
//
// This file is separate from lib/calendar/registry.ts on purpose: the registry's pinned strings
// belong to the existing grid. The UI pass reads this table; the two meet when the grid is replaced.

/** The violet that marks work in progress, as a CSS color. */
const CAL_VIOLET = 'var(--color-cal-works)'
/** The production blue, as a CSS color. */
const CAL_PRODUCTION = 'var(--cal-production)'
/** The lighter violet a pencil's dot wears. */
const CAL_PENCIL_DOT = 'color-mix(in oklab, var(--color-cal-works) 70%, var(--color-surface))'

const mix = (color: string, pct: number, base: string) => `color-mix(in oklab, ${color} ${pct}%, ${base})`
const clear = (color: string, pct: number) => `color-mix(in oklab, ${color} ${pct}%, transparent)`

interface KindLook {
  key: PlannerKind
  /** The full word a person reads. */
  word: string
  /** The short word a narrow chip prints. */
  short: string
  /** Which Show tile switches this kind on and off. */
  layer: PlannerLayer
  /** Fill. */
  bg: string
  /** Border shorthand, or 'none'. */
  bd: string
  /** Text color. */
  fg: string
  /** The dot or icon color. */
  dot: string
  /** Text decoration: cancelled items are struck through. */
  deco: 'none' | 'line-through'
}

/** The look of every kind. */
export const KINDS: Record<PlannerKind, KindLook> = {
  event: {
    key: 'event',
    word: 'Event',
    short: 'Evt',
    layer: 'events',
    bg: mix('var(--presence)', 11, 'var(--surface-card)'),
    bd: `1px solid ${clear('var(--presence)', 20)}`,
    fg: 'var(--text-strong)',
    dot: 'var(--presence)',
    deco: 'none',
  },
  pencil: {
    key: 'pencil',
    word: 'Pencil',
    short: 'Penc',
    layer: 'works',
    bg: 'var(--surface-card)',
    bd: `1.5px dashed ${clear(CAL_VIOLET, 45)}`,
    fg: 'var(--text-body)',
    dot: CAL_PENCIL_DOT,
    deco: 'none',
  },
  planning: {
    key: 'planning',
    word: 'Planning',
    short: 'Plng',
    layer: 'works',
    bg: mix(CAL_VIOLET, 12, 'var(--surface-card)'),
    bd: `1px solid ${clear(CAL_VIOLET, 18)}`,
    fg: 'var(--text-strong)',
    dot: CAL_VIOLET,
    deco: 'none',
  },
  production: {
    key: 'production',
    word: 'Production',
    short: 'Prod',
    layer: 'works',
    bg: 'var(--pa-soft), var(--pa-soft), var(--surface-card)',
    bd: `1px solid ${clear(CAL_PRODUCTION, 24)}`,
    fg: 'var(--text-strong)',
    dot: CAL_PRODUCTION,
    deco: 'none',
  },
  private: {
    key: 'private',
    word: 'Private',
    short: 'Priv',
    layer: 'private',
    bg: 'var(--surface-card)',
    bd: '1px solid var(--border-hair)',
    fg: 'var(--text-body)',
    dot: 'var(--text-faint)',
    deco: 'none',
  },
  unavailable: {
    key: 'unavailable',
    word: 'Unavailable',
    short: 'Unav',
    layer: 'unavailable',
    bg: 'repeating-linear-gradient(135deg, var(--track) 0 6px, transparent 6px 12px), var(--bg-sunken)',
    bd: 'none',
    fg: 'var(--text-muted)',
    dot: 'var(--text-faint)',
    deco: 'none',
  },
  todo: {
    key: 'todo',
    word: 'To-do',
    short: 'To-do',
    layer: 'todos',
    bg: mix('var(--reward)', 10, 'var(--surface-card)'),
    bd: `1px solid ${clear('var(--reward)', 20)}`,
    fg: 'var(--text-strong)',
    dot: 'var(--reward)',
    deco: 'none',
  },
  cancelled: {
    key: 'cancelled',
    word: 'Cancelled',
    short: 'Canc',
    layer: 'works',
    bg: 'none',
    bd: 'none',
    fg: 'var(--text-faint)',
    dot: 'var(--border-strong)',
    deco: 'line-through',
  },
}

/** The kinds in the order the Show list and legends print them. */
export const KIND_ORDER: readonly PlannerKind[] = [
  'event',
  'pencil',
  'planning',
  'production',
  'private',
  'unavailable',
  'todo',
  'cancelled',
]


/** Health pill colors: text and fill, as tokens. */
export const HEALTH_TONES = {
  onTrack: { fg: 'var(--presence)', bg: 'var(--presence-soft)' },
  overdue: { fg: 'var(--live)', bg: 'var(--live-soft)' },
  holding: { fg: 'var(--text-body)', bg: 'var(--bg-sunken)' },
  needsDate: { fg: 'var(--text-muted)', bg: 'var(--bg-sunken)' },
} as const

/** Timeline to-do dot colors: upcoming, overdue, done. */
export const TODO_DOT = {
  upcoming: 'var(--reward)',
  overdue: 'var(--live)',
  done: 'var(--text-faint)',
} as const

/** The four season washes behind a month header, as the custom properties app/globals.css defines. */
export const SEASON_WASH = {
  Winter: 'var(--cal-wash-winter)',
  Spring: 'var(--cal-wash-spring)',
  Summer: 'var(--cal-wash-summer)',
  Autumn: 'var(--cal-wash-autumn)',
} as const

/** The look for a kind, falling back to private for an unknown value so a bad row still draws. */
export function kindLook(kind: string | null | undefined): KindLook {
  return (kind && (KINDS as Record<string, KindLook>)[kind]) || KINDS.private
}
