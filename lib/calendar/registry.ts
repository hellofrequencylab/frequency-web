// THE CALENDAR REGISTRY (ADR-1385). One declaration of every LAYER a Space calendar can show and every
// KIND of private entry, so the grid, the staff drawer, the booking slot builder and the migration's
// check constraint all read one list. Pure: no React, no Supabase.
//
// A calendar is layers. The PUBLIC layer is the events system. The PRIVATE layers come from
// public.space_calendar_entries. A future source (a task due date, a shift, a project milestone, a
// booking) is ONE new layer here plus one adapter that turns its rows into CalendarEvent items; the
// grid needs no change. A new entry kind is one row in ENTRY_KINDS plus one value in the table's
// `kind` check constraint.

/** Where a calendar item came from. `events` is the public layer; the rest are private. */
export type CalendarLayerKey = 'events' | 'private' | 'unavailable'

export interface CalendarLayer {
  key: CalendarLayerKey
  /** Toggle label in the staff calendar. */
  label: string
  /** Chip classes for a grid card on this layer (semantic tokens only). */
  chipClass: string
  /** True when only the Space's team ever sees items on this layer in full. */
  private: boolean
}

export const CALENDAR_LAYERS: readonly CalendarLayer[] = [
  { key: 'events', label: 'Events', chipClass: 'bg-primary/10 text-primary-strong hover:bg-primary/20', private: false },
  { key: 'private', label: 'Private', chipClass: 'bg-info-bg text-info hover:bg-info/20', private: true },
  { key: 'unavailable', label: 'Unavailable', chipClass: 'bg-warning-bg text-warning hover:bg-warning/20', private: true },
] as const

export function calendarLayer(key: CalendarLayerKey | null | undefined): CalendarLayer {
  return CALENDAR_LAYERS.find((l) => l.key === key) ?? CALENDAR_LAYERS[0]
}

/** A kind of private entry. Mirrors the `kind` check on public.space_calendar_entries. */
export type EntryKind = 'unavailable' | 'private'

export interface EntryKindDef {
  kind: EntryKind
  /** The name staff see (docs/NAMING.md "Unavailable", "Private entry"). */
  label: string
  layer: CalendarLayerKey
  /** Form defaults when staff pick this kind. */
  defaults: { allDay: boolean; blocksTime: boolean }
  /** Whether staff may show this kind on the public calendar as "Unavailable". */
  canShowPublicly: boolean
}

export const ENTRY_KINDS: readonly EntryKindDef[] = [
  {
    kind: 'unavailable',
    label: 'Unavailable',
    layer: 'unavailable',
    defaults: { allDay: true, blocksTime: true },
    canShowPublicly: true,
  },
  {
    kind: 'private',
    label: 'Private entry',
    layer: 'private',
    defaults: { allDay: false, blocksTime: false },
    canShowPublicly: false,
  },
] as const

export function entryKind(kind: string | null | undefined): EntryKindDef | null {
  return ENTRY_KINDS.find((k) => k.kind === kind) ?? null
}

export const ENTRY_STATUSES = ['confirmed', 'tentative', 'cancelled'] as const
export type EntryStatus = (typeof ENTRY_STATUSES)[number]

export const ENTRY_VISIBILITIES = ['team', 'public_unavailable'] as const
export type EntryVisibility = (typeof ENTRY_VISIBILITIES)[number]
