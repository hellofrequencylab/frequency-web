import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// SEGMENTED CONTROL (HYG-105, owner ruling 2026-09-22). THE view-switcher form: one bordered box,
// the options as segments flush inside it, the selected segment filled. It replaces every
// hand-rolled switcher whose selected state painted `bg-primary` inside a raw <button>, and the
// pill row the Marketplace area nav still carried (HYG-092): UnderlineTabs stays the one tab
// vocabulary for a second-level row under this box (ADR-937 ruling 4), so a two-level browse
// surface reads box above, underline below, and never two of either.
//
// Two forms, one look:
//
//   <SegmentedControl label="Calendar views" value={view} onChange={setView}
//     segments={[{ value: 'admin', label: 'Calendar' }, { value: 'list', label: 'List' }]} />
//
//   <SegmentedLinks label="Browse areas" activeHref="/housing"
//     links={[{ href: '/classifieds', label: 'Classifieds' }, { href: '/housing', label: 'Housing' }]} />
//
// The button form is an in-page state switch: `role="group"` with a name, each segment a plain
// <button type="button" aria-pressed>. Tab moves between segments the way it moves between any
// buttons; there is no roving tabindex to invent, because these are buttons, not tabs. The link
// form is navigation: a <nav> with a name, each segment a real <Link> carrying `aria-current="page"`
// when it is the page you are on, so the row is crawlable and middle-clickable.
//
// The selected look is the brand fill (`bg-primary` / `text-on-primary`), the same pair the Button
// primitive's `primary` variant wears, unless the caller owns that look elsewhere: the calendar List
// rail's rows take their selected fill from lib/calendar/registry.ts (ADR-1503), where a cancelled
// gathering must never go brand blue, so a segment accepts `selectedClassName`. The fill and idle
// strings live in constants so the opening tag never carries `bg-primary` itself; the adoption
// ratchet (`raw-button-bg`) reads the tag, and a primitive that tripped it would count the fix as
// the bug.
//
// `vertical` stacks the segments as rows in one box (the List rail): each row keeps a 2px left
// edge that the selected fill colours, so a selected row whose fill must stay quiet (cancelled) is
// still selected by its edge alone. Segments carry `tap-target`, so the box respects `--tap-min`
// at every generation the way Button does. No corner is clipped: the first and last segments round
// their own outer corners rather than the box hiding overflow, because the global focus ring is an
// outer box-shadow and an `overflow-hidden` box would eat it.

export type SegmentedSize = 'sm' | 'md'
export type SegmentedOrientation = 'horizontal' | 'vertical'

export type Segment<V extends string> = {
  value: V
  label: ReactNode
  /** The selected look, when another module owns it (the calendar registry's stage fills). Defaults to the brand fill. */
  selectedClassName?: string
  /** Extra classes on the segment in every state (a truncating row, a fixed width). */
  className?: string
  /** `data-*` hooks the callers' tests and e2e specs read off the segment. */
  data?: Record<`data-${string}`, string | undefined>
}

export type SegmentedLink = { href: string; label: ReactNode }

const BOX = 'rounded-control border border-border bg-surface'
const BOX_BY_ORIENTATION: Record<SegmentedOrientation, string> = {
  horizontal: 'inline-flex max-w-full flex-wrap items-stretch',
  vertical: 'flex w-full flex-col',
}
const SEGMENT =
  'press tap-target font-semibold transition-colors motion-reduce:transition-none focus-visible:z-10'
const SEGMENT_BY_ORIENTATION: Record<SegmentedOrientation, string> = {
  horizontal: 'inline-flex items-center justify-center first:rounded-l-control last:rounded-r-control',
  vertical:
    'block w-full border-l-2 border-t border-t-border text-left first:rounded-t-control first:border-t-0 last:rounded-b-control',
}
const SIZE: Record<SegmentedSize, string> = {
  sm: 'px-3 py-1 text-body-sm',
  md: 'px-3 py-1.5 text-body-sm',
}
// The brand fill. `border-primary` has no width to paint in the horizontal box; in the vertical one
// it colours the row's left edge the same as its fill.
const SELECTED = 'bg-primary text-on-primary border-primary'
const IDLE = 'border-l-transparent text-muted hover:bg-surface-elevated hover:text-text'

export function SegmentedControl<V extends string>({
  label,
  value,
  onChange,
  segments,
  size = 'sm',
  orientation = 'horizontal',
  className,
}: {
  /** Accessible name for the group ("Calendar views"). Pass a specific one; a page can carry several. */
  label: string
  /** The selected segment, or null when none is (the calendar in Guest preview). */
  value: V | null
  onChange: (value: V) => void
  segments: readonly Segment<V>[]
  size?: SegmentedSize
  orientation?: SegmentedOrientation
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={cn(BOX, BOX_BY_ORIENTATION[orientation], className)}>
      {segments.map((segment) => {
        const selected = segment.value === value
        return (
          <button
            key={segment.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(segment.value)}
            {...segment.data}
            className={cn(
              SEGMENT,
              SEGMENT_BY_ORIENTATION[orientation],
              SIZE[size],
              selected ? (segment.selectedClassName ?? SELECTED) : IDLE,
              segment.className,
            )}
          >
            {segment.label}
          </button>
        )
      })}
    </div>
  )
}

export function SegmentedLinks({
  label,
  links,
  activeHref,
  size = 'sm',
  scroll,
  className,
}: {
  /** Accessible name for the nav ("Browse areas"). */
  label: string
  links: readonly SegmentedLink[]
  /** The href of the page you are on. Explicit, so a server component can render the row. */
  activeHref?: string
  size?: SegmentedSize
  /** Next's `scroll` prop, for a row that switches areas in place without jumping to the top. */
  scroll?: boolean
  className?: string
}) {
  return (
    <nav aria-label={label} className={cn(BOX, BOX_BY_ORIENTATION.horizontal, className)}>
      {links.map((link) => {
        const current = link.href === activeHref
        return (
          <Link
            key={link.href}
            href={link.href}
            scroll={scroll}
            aria-current={current ? 'page' : undefined}
            className={cn(SEGMENT, SEGMENT_BY_ORIENTATION.horizontal, SIZE[size], current ? SELECTED : IDLE)}
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
