// THE CALENDAR REGISTRY (ADR-1385). One declaration of every LAYER a Space calendar can show and every
// KIND of private entry, so the grid, the staff drawer, the booking slot builder and the migration's
// check constraint all read one list. Pure: no React, no Supabase.
//
// A calendar is layers. The PUBLIC layer is the events system. The PRIVATE layers come from
// public.space_calendar_entries. A future source (a task due date, a shift, a project milestone, a
// booking) is ONE new layer here plus one adapter that turns its rows into CalendarEvent items; the
// grid needs no change. A new entry kind is one row in ENTRY_KINDS plus one value in the table's `kind`
// check constraint.
//
// AN EVENT ON ITS WAY (ADR-1386, ADR-1388) is the entry kind `pencil`, which staff read as "Event". It
// moves through ENTRY_STAGES: Pencil, Planning, Production, Cancelled. The stage lives in its own column
// and the database derives `status` from it (a trigger), so everything that reads `status` stays right.

/** Where a calendar item came from. `events` is the public layer; the rest are private. */
export type CalendarLayerKey = 'events' | 'pencil' | 'private' | 'unavailable' | 'todos'

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
  { key: 'pencil', label: 'In the works', chipClass: 'border border-dashed border-primary/60 text-primary-strong hover:bg-primary/10', private: true },
  { key: 'private', label: 'Private', chipClass: 'bg-info-bg text-info hover:bg-info/20', private: true },
  { key: 'unavailable', label: 'Unavailable', chipClass: 'bg-warning-bg text-warning hover:bg-warning/20', private: true },
  { key: 'todos', label: 'To-dos', chipClass: 'bg-info-bg text-info hover:bg-info/20', private: true },
] as const

export function calendarLayer(key: CalendarLayerKey | null | undefined): CalendarLayer {
  return CALENDAR_LAYERS.find((l) => l.key === key) ?? CALENDAR_LAYERS[0]
}

/** A kind of private entry. Mirrors the `kind` check on public.space_calendar_entries. */
export type EntryKind = 'pencil' | 'unavailable' | 'private'

export interface EntryKindDef {
  kind: EntryKind
  /** The name staff see (docs/NAMING.md "Event", "Unavailable", "Private entry"). */
  label: string
  layer: CalendarLayerKey
  /** Form defaults when staff pick this kind. */
  defaults: { allDay: boolean; blocksTime: boolean }
  /** Whether staff may show this kind on the public calendar as "Unavailable". */
  canShowPublicly: boolean
  /** An event on its way: stages, a description, candidate dates and a lapse date (ADR-1386, ADR-1388). */
  isPencil: boolean
  /** Default status when staff pick this kind. */
  defaultStatus: 'confirmed' | 'tentative'
}

export const ENTRY_KINDS: readonly EntryKindDef[] = [
  {
    kind: 'pencil',
    label: 'Event',
    layer: 'pencil',
    defaults: { allDay: false, blocksTime: false },
    canShowPublicly: false,
    isPencil: true,
    defaultStatus: 'tentative',
  },
  {
    kind: 'unavailable',
    label: 'Unavailable',
    layer: 'unavailable',
    defaults: { allDay: true, blocksTime: true },
    canShowPublicly: true,
    isPencil: false,
    defaultStatus: 'confirmed',
  },
  {
    kind: 'private',
    label: 'Private entry',
    layer: 'private',
    defaults: { allDay: false, blocksTime: false },
    canShowPublicly: false,
    isPencil: false,
    defaultStatus: 'confirmed',
  },
] as const

export function entryKind(kind: string | null | undefined): EntryKindDef | null {
  return ENTRY_KINDS.find((k) => k.kind === kind) ?? null
}

export const ENTRY_STATUSES = ['confirmed', 'tentative', 'cancelled'] as const
export type EntryStatus = (typeof ENTRY_STATUSES)[number]

export const ENTRY_VISIBILITIES = ['team', 'public_unavailable'] as const
export type EntryVisibility = (typeof ENTRY_VISIBILITIES)[number]

/** How far along an event on its way is (ADR-1388). Mirrors the `stage` check on
 *  public.space_calendar_entries; the table's trigger sets `status` to the value below. */
export type EntryStage = 'pencil' | 'planning' | 'production' | 'cancelled'

export interface EntryStageDef {
  stage: EntryStage
  /** The stage name staff see (docs/NAMING.md). */
  label: string
  /** One plain line under the stage picker saying what the stage means. */
  hint: string
  /** The status the database derives for this stage. */
  status: EntryStatus
  /** Grid chip classes (semantic tokens only). Cancelled uses the grid's own struck-through style. */
  chipClass: string
}

export const ENTRY_STAGES: readonly EntryStageDef[] = [
  {
    stage: 'pencil',
    label: 'Pencil',
    hint: 'A date you are holding. Nothing is decided yet.',
    status: 'tentative',
    chipClass: 'border border-dashed border-primary/60 text-primary-strong hover:bg-primary/10',
  },
  {
    stage: 'planning',
    label: 'Planning',
    hint: 'It is happening on this date, and the team is putting it together.',
    status: 'confirmed',
    chipClass: 'border border-primary/60 bg-primary/5 text-primary-strong hover:bg-primary/15',
  },
  {
    stage: 'production',
    label: 'Production',
    hint: 'Ready to run. Publish it as an event when you want people to see it.',
    status: 'confirmed',
    chipClass: 'bg-primary/20 text-primary-strong hover:bg-primary/30',
  },
  {
    stage: 'cancelled',
    label: 'Cancelled',
    hint: 'Not happening. It stays on the team calendar, struck through.',
    status: 'cancelled',
    chipClass: 'bg-surface-elevated text-muted line-through',
  },
] as const

export function entryStage(stage: string | null | undefined): EntryStageDef | null {
  return ENTRY_STAGES.find((d) => d.stage === stage) ?? null
}

/** The chip classes for a calendar item: its stage when it has one, otherwise its layer. */
export function itemChipClass(layer: CalendarLayerKey | null | undefined, stage?: string | null): string {
  return entryStage(stage)?.chipClass ?? calendarLayer(layer).chipClass
}
