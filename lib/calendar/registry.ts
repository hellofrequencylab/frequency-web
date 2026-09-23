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
//
// ─── COLOUR PLUS THE WORD, ALWAYS (LIVE-470, owner ruling 2026-09-22) ────────────────────────
// CALENDAR_PRESENTATIONS below is THE table: one row per kind of calendar item, carrying its FORM,
// its COLOUR and its WORD. Four surfaces paint a calendar item and all four read this one row:
//   · the month-grid chip            components/events/event-calendar.tsx
//   · the List pill                  components/spaces/calendar-list-view.tsx (through list-index)
//   · the popup pill                 the same StatusChip, inside event-calendar's CalendarPreview
//   · the Workflow card              components/spaces/calendar-workflow-view.tsx
// None of them keeps a stage colour table of its own, and because every one of them prints the
// word, a legend is never needed.
//
// WHY THESE COLOURS. Planning, Private entry and To-dos all painted `bg-info-bg text-info` until
// this row, so three different things looked like one thing. Each now takes its own token family,
// and each family is a PAIR scripts/check-contrast.mjs already measures in DAWN and Midnight,
// light and dark (lowest reading of the four states, AA body floor is 4.5):
//   planning     info        4.75    private    broadcast   4.75    todos   move    6.54
//   production   success     4.72    unavailable warning    4.72    event   primary 4.81
// `danger` stays the Cancelled badge alone; `signal` is not used because it is one teal with
// `success` in dark mode. The events layer moved off `bg-primary/10` to the solid `-bg` step: the
// translucent ground measured 4.45 on the member shell and the declared pair does not.
// In dark mode `primary` and `warning` resolve to the same amber, so an Event and an Unavailable
// block on the same public calendar read alike — which is exactly why the word is not optional.
//
// THE WORD, and who prints it (owner ruling 2026-09-23). Every TEAM surface prints `word`: the
// staff grid chip, the List pill, the Workflow card and the popup, where Planning, Private entry
// and To-dos sit side by side and the word is the thing that tells them apart. A `member` surface
// prints no word on its chips, because THE WORD SEPARATES KINDS AND A SURFACE WITH ONE KIND HAS
// NOTHING TO SEPARATE: every row of a public Space calendar is an event, so the word would repeat
// on every chip without distinguishing anything from anything. The colours stay on both surfaces.
// Do not "fix" the member half back; the lever is the `audience` argument, never a flag on a row.
//
// THE 360px RULE. At NARROW_GRID_WIDTH and below a day cell is about 46px, so the grid chip trades
// a few pixels of title for `shortWord` and ABBREVIATES rather than dropping it. Planning
// abbreviates to "Plng" and never to "Plan": docs/NAMING.md reserves capital-P Plan for the OBJECT
// (ADR-1523). NAMING's "never abbreviate to PPP" is about naming the three stages COLLECTIVELY in
// prose, which nothing here does.

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
/** The lift a chip takes under the pointer. A ring, not an opacity step, so the contrast gate can
 *  still read the pair underneath it. */
const CHIP_HOVER = 'hover:ring-1 hover:ring-current'

/** One row of CALENDAR_PRESENTATIONS. A stage where the item has one, otherwise its layer. */
export type CalendarPresentationKey =
  | 'event'
  | 'draft'
  | 'pencil'
  | 'planning'
  | 'production'
  | 'cancelled'
  | 'private'
  | 'unavailable'
  | 'todos'

export interface CalendarPresentation {
  key: CalendarPresentationKey
  /** FORM + COLOUR: the chip classes for a grid card, a stack segment or a Workflow card. */
  chipClass: string
  /** THE WORD. Every surface prints it beside the colour. */
  word: string
  /** The word at NARROW_GRID_WIDTH and below. Never empty: the chip abbreviates, never drops. */
  shortWord: string
  /** The tone of the pill that says the word (StatusChip, components/admin/status.tsx). */
  tone: EntryStageTone
  /** Classes for the item's title written outside a chip. Empty unless the item was called off. */
  titleClass: string
}

/** 🔴 THE ONE STAGE PRESENTATION (LIVE-470). Add a colour here or nowhere. */
export const CALENDAR_PRESENTATIONS: Record<CalendarPresentationKey, CalendarPresentation> = {
  event: {
    key: 'event',
    chipClass: `bg-primary-bg text-primary-strong ${CHIP_HOVER}`,
    word: 'Event',
    shortWord: 'Evt',
    tone: 'brand',
    titleClass: '',
  },
  draft: {
    key: 'draft',
    chipClass: `bg-surface-elevated text-muted ${CHIP_HOVER}`,
    word: 'Draft',
    shortWord: 'Draft',
    tone: 'neutral',
    titleClass: '',
  },
  pencil: {
    key: 'pencil',
    chipClass: PENCIL_CHIP_CLASS,
    word: 'Pencil',
    shortWord: 'Penc',
    tone: 'neutral',
    titleClass: '',
  },
  planning: {
    key: 'planning',
    chipClass: `bg-info-bg text-info ${CHIP_HOVER}`,
    word: 'Planning',
    shortWord: 'Plng',
    tone: 'info',
    titleClass: '',
  },
  production: {
    key: 'production',
    chipClass: `border border-success bg-success-bg text-success ${CHIP_HOVER}`,
    word: 'Production',
    shortWord: 'Prod',
    tone: 'success',
    titleClass: '',
  },
  cancelled: {
    key: 'cancelled',
    chipClass: `bg-surface-elevated ${CANCELLED_TEXT_CLASS}`,
    word: 'Cancelled',
    shortWord: 'Canc',
    tone: 'danger',
    titleClass: CANCELLED_TEXT_CLASS,
  },
  private: {
    key: 'private',
    chipClass: `border border-broadcast-strong bg-broadcast-bg text-broadcast-strong ${CHIP_HOVER}`,
    word: 'Private',
    shortWord: 'Priv',
    tone: 'broadcast',
    titleClass: '',
  },
  unavailable: {
    key: 'unavailable',
    chipClass: `bg-warning-bg text-warning ${CHIP_HOVER}`,
    word: 'Unavailable',
    shortWord: 'Unav',
    tone: 'warning',
    titleClass: '',
  },
  todos: {
    key: 'todos',
    chipClass: `border border-dotted border-move-strong bg-move-bg text-move-strong ${CHIP_HOVER}`,
    word: 'To-do',
    shortWord: 'To-do',
    tone: 'move',
    titleClass: '',
  },
}

export const CALENDAR_LAYERS: readonly CalendarLayer[] = [
  { key: 'events', label: 'Events', chipClass: CALENDAR_PRESENTATIONS.event.chipClass, private: false },
  { key: 'pencil', label: 'In the works', chipClass: CALENDAR_PRESENTATIONS.pencil.chipClass, private: true },
  { key: 'private', label: 'Private', chipClass: CALENDAR_PRESENTATIONS.private.chipClass, private: true },
  { key: 'unavailable', label: 'Unavailable', chipClass: CALENDAR_PRESENTATIONS.unavailable.chipClass, private: true },
  { key: 'todos', label: 'To-dos', chipClass: CALENDAR_PRESENTATIONS.todos.chipClass, private: true },
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
 *  the item itself is grey. `brand`, `broadcast` and `move` joined the StatusChip vocabulary with
 *  LIVE-470, which is what lets the List pill and the popup say Event, Private and To-do in the
 *  same colours their grid chips take. */
export type EntryStageTone = 'neutral' | 'info' | 'success' | 'danger' | 'warning' | 'brand' | 'broadcast' | 'move'

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

/** A stage's four presentation fields are the table's, never its own: `label` IS the word the grid
 *  chip, the List pill, the popup and the Workflow card all print. */
function stageDef(stage: EntryStage, status: EntryStatus, hint: string): EntryStageDef {
  const look = CALENDAR_PRESENTATIONS[stage]
  return {
    stage,
    label: look.word,
    hint,
    status,
    chipClass: look.chipClass,
    badgeTone: look.tone,
    titleClass: look.titleClass,
  }
}

export const ENTRY_STAGES: readonly EntryStageDef[] = [
  stageDef('pencil', 'tentative', 'A tentative date. Nothing is decided yet.'),
  stageDef('planning', 'confirmed', 'It is happening on this date, and the team is putting it together.'),
  stageDef('production', 'confirmed', 'Ready to run. Publish it as an event when you want people to see it.'),
  stageDef('cancelled', 'cancelled', 'Not happening. It stays on the team calendar, struck through.'),
] as const

export function entryStage(stage: string | null | undefined): EntryStageDef | null {
  return ENTRY_STAGES.find((d) => d.stage === stage) ?? null
}

/** True when the item is called off: by its stage, or by the flag a published event carries. */
export function itemIsCancelled(stage: string | null | undefined, isCancelled?: boolean | null): boolean {
  return isCancelled === true || stage === 'cancelled'
}

/** Who is reading the calendar. Two things turn on it, and nothing else does.
 *
 *  THE WORD. A `team` surface prints it; a `member` surface does not (owner ruling 2026-09-23,
 *  and see the header). `calendarPrintsWord` below is that rule, in one place.
 *
 *  WHICH WORD. docs/NAMING.md: once a Production is published, member-facing surfaces call it an
 *  event, and the word Production belongs to the team's planning surfaces. So the same item is an
 *  "Event" for a member and a "Production" for the team. It is the same ROW of the table either
 *  way, so its colour and its form cannot drift between the two. */
export type CalendarAudience = 'member' | 'team'

/** Whether a calendar for this audience prints the stage word on its chips. The word separates
 *  KINDS; a member-facing calendar shows one kind, so it has nothing to separate and stays quiet. */
export function calendarPrintsWord(audience: CalendarAudience): boolean {
  return audience === 'team'
}

/** The little a presentation needs to know about an item. A `CalendarEvent` satisfies it. */
export interface PresentableItem {
  layer?: CalendarLayerKey | null
  stage?: string | null
  isCancelled?: boolean | null
  statusLabel?: string | null
}

/** 🔴 THE ONE READ. Form, colour and word for any calendar item, for all four surfaces.
 *
 *  Cancelled wins over everything. Then the item's own stage. Then its layer. An events-layer item
 *  with no stage of its own is a draft when it says so, and otherwise is the published thing: the
 *  team calls that Production, a member calls it an Event. */
export function calendarPresentation(
  item: PresentableItem,
  audience: CalendarAudience = 'member',
): CalendarPresentation {
  if (itemIsCancelled(item.stage, item.isCancelled)) return CALENDAR_PRESENTATIONS.cancelled
  const staged = entryStage(item.stage)
  if (staged) return CALENDAR_PRESENTATIONS[staged.stage]
  const layer = item.layer ?? 'events'
  if (layer !== 'events') return CALENDAR_PRESENTATIONS[layer]
  if (item.statusLabel === 'Draft') return CALENDAR_PRESENTATIONS.draft
  return audience === 'team' ? CALENDAR_PRESENTATIONS.production : CALENDAR_PRESENTATIONS.event
}

/** THE 360px RULE (LIVE-470, owner ruling 2026-09-22). At this viewport a month-grid day cell is
 *  about 46px wide, which the full word plus a readable slice of title does not fit into. The chip
 *  prints the SHORT word there. It never prints no word. */
export const NARROW_GRID_WIDTH = 360

/** True when the grid is at or under NARROW_GRID_WIDTH. A width it cannot measure is not narrow. */
export function isNarrowGrid(viewportWidth: number | null | undefined): boolean {
  return typeof viewportWidth === 'number' && Number.isFinite(viewportWidth) && viewportWidth <= NARROW_GRID_WIDTH
}

/** The word a chip prints at a given width: abbreviated when narrow, never dropped. */
export function calendarWord(look: CalendarPresentation, narrow: boolean): string {
  return narrow ? look.shortWord : look.word
}

/** The chip classes for a calendar item: cancelled first, then its stage, otherwise its layer. */
export function itemChipClass(
  layer: CalendarLayerKey | null | undefined,
  stage?: string | null,
  isCancelled?: boolean | null,
): string {
  return calendarPresentation({ layer, stage, isCancelled }).chipClass
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
