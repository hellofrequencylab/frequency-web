'use client'

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { ChevronLeft, ChevronRight, CircleHelp, Plus, X } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { addMonth, monthLabel } from '@/lib/events/calendar-grid'
import { verticalScrollTaker } from '@/components/events/use-month-gestures'
import { agendaForMonth, type ListIndexItem } from '@/lib/calendar/list-index'
import { itemSelectedClass, itemTitleClass } from '@/lib/calendar/registry'
import { timezoneLabel } from '@/lib/spaces/booking-format'
import { cn } from '@/lib/utils'

// THE CALENDAR CONSOLE (PROG-CAL12, owner ask 2026-09-22). The Space calendar's full-screen edit mode:
// the page's own Guest / Calendar / List / Workflow panels, lifted into a full-screen OVERLAY with the
// shown month's agenda down the left and the controls across the top. It renders NOTHING of its own
// that the page does not already render: the panel set is the workspace's, and it arrives in the
// `stageRef` slot below as a live DOM move, never as a second copy (see THE STAGE SLOT).
//
// It is a takeover LAYOUT, not the Fullscreen API. lib/fullscreen.ts records the owner's decision
// (2026-06-22): Element.requestFullscreen is never called, because the browser's own "press Esc to
// exit" banner read as a warning popup. Dialog's `overlay` align gives the panel the viewport minus a
// thin margin of the dimmed page, at every width.
//
// Entry is deliberate only: the "Fullscreen" control or the F key, never a scroll, hover, double
// click, resize, rotation or remembered preference. Exit is Esc (layered: the Plan drawer first when
// it is up), the Close control, and the browser's Back button, all owned by the workspace so the URL
// (`?console=1`) and focus restore stay in one place. The keys below live here because they are the
// console's: Up / Down and Left / Right page months, T is today, N pencils a date, ? opens the
// shortcut sheet.
//
// THE PANEL IS A FIXED HEIGHT AND THE MONTH FITS IN IT (PROG-CAL13). Header, side bar and stage are
// grid tracks, the stage row is `minmax(0,1fr)`, and the grid inside sizes to the row rather than to
// its content, so all six weeks are on screen and nothing here grows a scrollbar to reach the last
// one. The side bar is the agenda over Ask Vera: the agenda scrolls, Vera is a footer that does not.
//
// THE STAGE SLOT. `stageRef` is the element the workspace parks its live panel set in. The workspace
// keeps that set at ONE position in the React tree and moves only its DOM home, so opening and closing
// the console no longer tears the whole calendar down and rebuilds it. See the BLINK note at the
// top of calendar-workspace.tsx for what that cost and why it read as a blink.

/** Keys stay out of anything the person is typing into. Shared with the page's F key. */
export function keyTargetIsTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.closest !== 'function') return false
  return el.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null
}

const SHORTCUTS: readonly { keys: string[]; what: string }[] = [
  { keys: ['F'], what: 'Open the console from the page' },
  { keys: ['Up', 'Down', 'Left', 'Right'], what: 'Previous or next month' },
  { keys: ['T'], what: 'Back to today' },
  { keys: ['N'], what: 'Pencil it in' },
  // MOVING A DATE IS A KEY, NOT ONLY A DRAG (PROG-CAL15). A date on the grid takes focus like any
  // other button, and these two rows are the whole move: the shape of the grid is a week, so a
  // sideways Shift is a day and an up or down Shift is the same weekday next week or last.
  { keys: ['Shift', 'Left', 'Right'], what: 'Move the focused date a day' },
  { keys: ['Shift', 'Up', 'Down'], what: 'Move the focused date a week' },
  { keys: ['Enter'], what: 'Open the focused date' },
  { keys: ['?'], what: 'These shortcuts' },
  { keys: ['Esc'], what: 'Put a date being moved back, then close the drawer, then the console' },
]

function viewerZone(): { name: string; short: string } {
  try {
    const name = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    return { name, short: timezoneLabel(name) }
  } catch {
    return { name: 'UTC', short: 'UTC' }
  }
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-control border border-border bg-surface px-1.5 py-0.5 text-3xs font-semibold leading-none text-muted">
      {children}
    </kbd>
  )
}

export function CalendarConsole({
  open,
  onClose,
  month,
  onMonthChange,
  viewControls,
  items,
  selectedKey,
  onSelectItem,
  onOpenPlan,
  onPencil,
  resultLine,
  stageRef,
  veraRef,
}: {
  open: boolean
  /** Esc and the Close control. The workspace layers it: the Plan drawer closes first when it is up. */
  onClose: () => void
  month: { year: number; month1: number }
  onMonthChange: (next: { year: number; month1: number }) => void
  /** The page's own Guest preview toggle and CalendarModeToggle, so the two headers cannot drift. */
  viewControls: ReactNode
  /** The List index (`listIndexItems`); the agenda keeps the shown month of it. */
  items: ListIndexItem[]
  selectedKey: string | null
  onSelectItem: (key: string) => void
  onOpenPlan: (planId: string, entryId?: string | null) => void
  /** "Pencil it in" and the N key. Absent for a viewer who cannot edit. */
  onPencil?: () => void
  /** ONE MOVE, ONE LINE (PROG-CAL15): what the last date move did, or why it did not. The grid
   *  speaks it through its own live region, so this line is the sighted half and does not announce
   *  a second time. Empty until something happens. */
  resultLine?: string | null
  /** Where the workspace parks the live panel set. See THE STAGE SLOT above. */
  stageRef: Ref<HTMLDivElement>
  /** Where the workspace parks Ask Vera: the foot of the side bar. Absent for a viewer who cannot
   *  edit, and then the side bar is the agenda alone. Moved the same live way the stage is. */
  veraRef?: Ref<HTMLDivElement>
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  // The console only ever renders on the client (Dialog portals there), so the browser's zone is safe
  // to read once. It is the zone new pencils default to and the zone the today ring is drawn in.
  const [zone] = useState(viewerZone)

  const { year, month1 } = month
  const label = monthLabel(year, month1)
  // `step` and `today` are memoised so the key handler below has a dependency array that only moves
  // when the month does. It used to have NO array at all, which tore down and re-registered a
  // document-level keydown listener on every single render of the console: every month step, view
  // switch, agenda selection and Vera keystroke.
  const step = useCallback((delta: number) => onMonthChange(addMonth(year, month1, delta)), [onMonthChange, year, month1])
  const today = useCallback(() => {
    const now = new Date()
    onMonthChange({ year: now.getFullYear(), month1: now.getMonth() + 1 })
  }, [onMonthChange])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      // The grid already answers ArrowLeft / ArrowRight when it is focused (and PageUp / PageDown
      // anywhere inside it), and marks the event handled; one key must move one month.
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      if (keyTargetIsTyping(e.target)) return
      // A key pressed inside a dialog stacked on top (the Plan drawer, the entry form, the shortcuts
      // sheet, the grid's own month picker) belongs to that dialog.
      const target = e.target as HTMLElement | null
      const dialog = target && typeof target.closest === 'function' ? target.closest('[role="dialog"]') : null
      if (dialog && !dialog.contains(rootRef.current)) return
      switch (e.key) {
        case 'ArrowLeft':
          step(-1)
          break
        case 'ArrowRight':
          step(1)
          break
        // MONTHS RUN DOWN THE PANEL (owner ask 2026-09-23), the same direction the wheel pages them,
        // and Left / Right keep doing what they always did. Anything under the key that can still
        // scroll that way keeps it: the agenda and a busy day's own cell are read with these keys.
        case 'ArrowUp':
        case 'ArrowDown': {
          const delta = e.key === 'ArrowDown' ? 1 : -1
          if (verticalScrollTaker(e.target, delta, rootRef.current)) return
          step(delta)
          break
        }
        case 't':
        case 'T':
          today()
          break
        case 'n':
        case 'N':
          if (!onPencil) return
          onPencil()
          break
        case '?':
          setHelpOpen(true)
          break
        default:
          return
      }
      e.preventDefault()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, step, today, onPencil])

  const days = agendaForMonth(items, year, month1)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      align="overlay"
      ariaLabelledBy="calendar-console-title"
      // THE PANEL IS THE CARD: the surface token, the card radius, a real elevation, and its own
      // clipping so the agenda's sticky headings and the grid never paint over the rounded corners.
      className="h-full overflow-hidden rounded-card border border-border bg-surface lift-3"
    >
      <div
        ref={rootRef}
        data-calendar-console
        className="grid h-full min-h-0 grid-cols-1 grid-rows-[auto_auto_minmax(0,1fr)] text-text lg:grid-cols-[19rem_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)]"
      >
        {/* THE HEADER, in three groups reading left to right: what you are looking at, how to move
            through it, and what you can do to it. Close is last and carries its own border so it
            never reads as one more action in the cluster. */}
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2 sm:px-4 lg:col-span-2">
          <div className="flex min-w-0 items-baseline gap-2">
            {/* ONE ANNOUNCEMENT, ALWAYS THIS ONE. The grids inside the console run with `hostChrome`,
                so none of them draws a month title and none of them speaks: this heading is the
                month, and it says so once whichever panel is showing. */}
            <h2
              id="calendar-console-title"
              className="truncate text-lead font-bold text-text"
              aria-live="polite"
            >
              {label}
            </h2>
            <span className="shrink-0 text-meta text-muted" title={`Today and new dates use ${zone.name}`}>
              {zone.short}
            </span>
          </div>

          <div className="flex items-center gap-0.5 rounded-control border border-border p-0.5">
            <IconButton label="Previous month" onClick={() => step(-1)}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </IconButton>
            <Button type="button" variant="ghost" size="sm" onClick={today}>
              Today
            </Button>
            <IconButton label="Next month" onClick={() => step(1)}>
              <ChevronRight className="h-4 w-4" aria-hidden />
            </IconButton>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {viewControls}
            {onPencil && (
              <Button type="button" variant="secondary" size="sm" onClick={onPencil}>
                <Plus className="h-4 w-4" aria-hidden /> Pencil it in
              </Button>
            )}
            <IconButton label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={() => setHelpOpen(true)}>
              <CircleHelp className="h-4 w-4" aria-hidden />
            </IconButton>
            <span className="hidden h-6 w-px shrink-0 bg-border sm:block" aria-hidden />
            <IconButton variant="bordered" label="Close the console" title="Close the console (Esc)" onClick={onClose}>
              <X className="h-4 w-4" aria-hidden />
            </IconButton>
          </div>

          {/* WHAT THE LAST MOVE DID. Its own line under the controls, so a long sentence never
              reflows the cluster above it. ALWAYS MOUNTED and hidden by a class when there is
              nothing to say: an element that comes and goes re-inserts a DOM node on a state change,
              which is what left the console blinking twice already (LIVE-474, LIVE-477). */}
          <p
            data-calendar-move-result
            className={cn('w-full text-body-sm text-muted', !resultLine && 'hidden')}
          >
            {resultLine ?? ''}
          </p>
        </header>

        {/* THE SIDE BAR: the shown month's agenda, with Ask Vera along its foot (owner ask
            2026-09-23, which took Vera out of the full-width band that was costing the grid a row).
            The agenda takes the height and scrolls; Vera is a footer that stays put, so a long month
            never pushes it off screen and a proposal opens against a column that is still there. A
            strip above the grid on a phone, a column on a desk, and ONE hairline between it and the
            stage rather than a filled sidebar. Rows select the same item the List view selects. */}
        <div
          data-calendar-sidebar
          className="flex max-h-52 min-h-0 flex-col border-b border-border lg:max-h-none lg:border-b-0 lg:border-r"
        >
          <aside
            data-calendar-agenda
            aria-label={`Agenda for ${label}`}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          >
            {days.length === 0 ? (
              <p className="px-4 py-4 text-body-sm text-muted">Nothing on the calendar in {label}. Pencil a date to start.</p>
            ) : (
              days.map((day) => (
                <section key={day.dayKey} aria-label={day.label} className="pb-2">
                  <h3 className="sticky top-0 z-10 border-b border-border bg-surface px-4 pb-1.5 pt-3 text-body-sm font-semibold text-text">
                    {day.label}
                  </h3>
                  <ul className="space-y-1 px-2 pt-1.5">
                    {day.items.map((item) => {
                      const current = selectedKey === item.key
                      const titleClass = itemTitleClass(item.stage, item.isCancelled)
                      return (
                        <li key={item.key} className="flex items-stretch gap-1">
                          <button
                            type="button"
                            onClick={() => onSelectItem(item.key)}
                            aria-pressed={current}
                            className={cn(
                              'min-w-0 flex-1 rounded-card border px-2.5 py-1.5 text-left transition-colors motion-reduce:transition-none',
                              current
                                ? itemSelectedClass(item.stage, item.isCancelled)
                                : cn('border-border bg-surface hover:border-border-strong hover:bg-surface-elevated', titleClass),
                            )}
                          >
                            <span className={cn('block truncate text-body-sm font-semibold', titleClass)}>
                              {item.isCancelled && <span className="sr-only">Cancelled. </span>}
                              {item.title}
                            </span>
                            <span className="mt-0.5 block truncate text-meta text-muted">{item.whenLabel}</span>
                          </button>
                          {item.planId && (
                            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenPlan(item.planId!, item.entryId)}>
                              Open Plan
                            </Button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))
            )}
          </aside>
          {/* Ask Vera holds the foot of the column: `shrink-0`, so a long agenda never squeezes it
              out, and capped with its own scroll, so a long PROPOSAL scrolls here instead of taking
              the column and pushing the agenda off screen. */}
          {veraRef ? (
            <div
              ref={veraRef}
              data-calendar-console-vera
              className="max-h-36 shrink-0 overflow-y-auto overscroll-contain border-t border-border p-2 lg:max-h-[55%]"
            />
          ) : null}
        </div>

        {/* THE STAGE. The workspace parks its live panel set here; the panel set brings its own scroll
            (overscroll contained), so the console body never moves the page behind it. */}
        <div ref={stageRef} data-calendar-console-stage className="flex min-h-0 flex-col p-2 sm:p-3" />
      </div>

      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} ariaLabelledBy="calendar-console-keys" align="center" className="max-w-sm">
        <div className="rounded-card border border-border bg-surface p-5 lift-3">
          <div className="flex items-start justify-between gap-3">
            <h3 id="calendar-console-keys" className="text-lead font-bold text-text">
              Keyboard shortcuts
            </h3>
            <IconButton label="Close the shortcuts" onClick={() => setHelpOpen(false)}>
              <X className="h-4 w-4" aria-hidden />
            </IconButton>
          </div>
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 text-body-sm">
            {SHORTCUTS.map((row) => (
              <Fragment key={row.what}>
                <dt className="flex items-center gap-1">
                  {row.keys.map((key) => (
                    <Key key={key}>{key}</Key>
                  ))}
                </dt>
                <dd className="text-muted">{row.what}</dd>
              </Fragment>
            ))}
          </dl>
          <p className="mt-3 text-meta text-muted">Keys wait while you are typing in a field.</p>
        </div>
      </Dialog>
    </Dialog>
  )
}
