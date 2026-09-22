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
//
// HOW A STAGE LOOKS is decided here and nowhere else. Every surface that paints a stage (the month
// grid, the List view, the Space profile events block) reads this table; none hand-rolls a class.
// A state is never a hue alone (WCAG 1.4.1, whose own failure example is a colour-coded calendar):
// each stage is FORM + colour + its word.
//   Pencil      dashed border on a neutral ground: a date being held, nothing decided.
//   Planning    a solid info tint: decided, being put together.
//   Production  a solid success tint with a solid edge: ready to run.
//   Cancelled   muted, struck through, on the neutral ground. Never the brand accent and never
//               danger red on the chip itself; danger is for the badge that says the word.
// The brand accent (`primary`) is not spent on stages: it is the one chrome accent, and in dark
// mode `warning` is the same colour as it, so neither is a stage. `signal` and `success` are one
// teal in dark mode, so only `success` is used. No opacity modifiers: the contrast gate cannot see
// them, and every pair below is one it checks (scripts/check-contrast.mjs).

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

/** Cancelled anywhere it is written: muted and struck through. The brand fill never wins over it. */
export const CANCELLED_TEXT_CLASS = 'text-muted line-through'
const PENCIL_CHIP_CLASS = 'border border-dashed border-border-strong bg-surface text-text hover:bg-surface-elevated'

export const CALENDAR_LAYERS: readonly CalendarLayer[] = [
  { key: 'events', label: 'Events', chipClass: 'bg-primary/10 text-primary-strong hover:bg-primary/20', private: false },
  { key: 'pencil', label: 'In the works', chipClass: PENCIL_CHIP_CLASS, private: true },
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

/** The tone a stage badge takes. A subset of the admin StatusChip vocabulary
 *  (components/admin/status.tsx), so the badge that says the stage word uses the same pills as
 *  every other status in the product. `danger` is only ever the Cancelled badge: the word is red,
 *  the item itself is grey. */
export type EntryStageTone = 'neutral' | 'info' | 'success' | 'danger'

export interface EntryStageDef {
  stage: EntryStage
  /** The stage name staff see (docs/NAMING.md). */
  label: string
  /** One plain line under the stage picker saying what the stage means. */
  hint: string
  /** The status the database derives for this stage. */
  status: EntryStatus
  /** Chip classes for a grid card or a list row (semantic tokens only, no opacity modifiers). */
  chipClass: string
  /** The tone of the badge that says the stage word. */
  badgeTone: EntryStageTone
  /** Classes for the item's title wherever it is written outside a chip (a list row, a viewer
   *  heading). Empty for a live stage; struck and muted for Cancelled. */
  titleClass: string
}

export const ENTRY_STAGES: readonly EntryStageDef[] = [
  {
    stage: 'pencil',
    label: 'Pencil',
    hint: 'A tentative date. Nothing is decided yet.',
    status: 'tentative',
    chipClass: PENCIL_CHIP_CLASS,
    badgeTone: 'neutral',
    titleClass: '',
  },
  {
    stage: 'planning',
    label: 'Planning',
    hint: 'It is happening on this date, and the team is putting it together.',
    status: 'confirmed',
    chipClass: 'bg-info-bg text-info hover:ring-1 hover:ring-current',
    badgeTone: 'info',
    titleClass: '',
  },
  {
    stage: 'production',
    label: 'Production',
    hint: 'Ready to run. Publish it as an event when you want people to see it.',
    status: 'confirmed',
    chipClass: 'border border-success bg-success-bg text-success hover:ring-1 hover:ring-current',
    badgeTone: 'success',
    titleClass: '',
  },
  {
    stage: 'cancelled',
    label: 'Cancelled',
    hint: 'Not happening. It stays on the team calendar, struck through.',
    status: 'cancelled',
    chipClass: `bg-surface-elevated ${CANCELLED_TEXT_CLASS}`,
    badgeTone: 'danger',
    titleClass: CANCELLED_TEXT_CLASS,
  },
] as const

export function entryStage(stage: string | null | undefined): EntryStageDef | null {
  return ENTRY_STAGES.find((d) => d.stage === stage) ?? null
}

/** True when the item is called off: by its stage, or by the flag a published event carries. */
export function itemIsCancelled(stage: string | null | undefined, isCancelled?: boolean | null): boolean {
  return isCancelled === true || stage === 'cancelled'
}

/** The chip classes for a calendar item: cancelled first, then its stage, otherwise its layer. */
export function itemChipClass(
  layer: CalendarLayerKey | null | undefined,
  stage?: string | null,
  isCancelled?: boolean | null,
): string {
  if (itemIsCancelled(stage, isCancelled)) return entryStage('cancelled')!.chipClass
  return entryStage(stage)?.chipClass ?? calendarLayer(layer).chipClass
}

/** The classes for an item's title written outside a chip: struck and muted when cancelled. */
export function itemTitleClass(stage?: string | null, isCancelled?: boolean | null): string {
  if (itemIsCancelled(stage, isCancelled)) return CANCELLED_TEXT_CLASS
  return entryStage(stage)?.titleClass ?? ''
}

/** The tone of the badge that says an item's stage word. Falls back to neutral for an item with no
 *  stage that is not cancelled (a draft), so a caller never has to key a tone off a label string. */
export function itemBadgeTone(stage?: string | null, isCancelled?: boolean | null): EntryStageTone {
  if (itemIsCancelled(stage, isCancelled)) return entryStage('cancelled')!.badgeTone
  return entryStage(stage)?.badgeTone ?? 'neutral'
}

/** A selected row in a list index. A live row takes the brand fill; a cancelled row shows selection
 *  by its edge alone, so the brand never paints over the struck-through grey. */
export function itemSelectedClass(stage?: string | null, isCancelled?: boolean | null): string {
  if (itemIsCancelled(stage, isCancelled)) return `border-primary bg-surface-elevated ${CANCELLED_TEXT_CLASS}`
  return 'border-primary bg-primary-bg text-primary-strong'
}
