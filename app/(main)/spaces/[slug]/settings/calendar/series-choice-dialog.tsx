'use client'

import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { shortDateLabel } from '@/lib/calendar/short-date'
import {
  SERIES_DELETE_COPY,
  SERIES_SAVE_COPY,
  type SeriesDeleteChoice,
  type SeriesDeletePlan,
  type SeriesSaveChoice,
} from '@/lib/calendar/series-choice'

// THE QUESTION A REPEATING ENTRY IS OWED (LIVE-531). One row is the whole series, and the delete is
// a hard delete with no tombstone, so the only safe Delete on a repeating entry is one that asks
// which dates it means. The decision, and every sentence in here, live in
// lib/calendar/series-choice.ts; this file is the surface.
//
// SHAPE. The shared `Dialog` primitive (chrome, ESC, backdrop, focus trap and restore, scroll lock)
// with the DangerModal panel's look, because this IS that pattern wearing a third choice:
// `components/admin/danger-modal.tsx` is confirm-or-cancel and cannot express "this date only"
// without becoming a different component. The safe way out takes focus, exactly as DangerModal's
// cancel does, so Enter on arrival never destroys anything.
//
// Each choice is a button with its OWN sentence underneath, and the button is `aria-describedby`
// that sentence: a screen reader hears what the press reaches, not three verbs in a row. The
// destructive choice sits LAST and alone in the danger tone.

/** THE SAFE WAY OUT TAKES FOCUS on arrival, so Enter on a dialog the person has not read yet can
 *  never be the destructive choice. Same rule and same shape as components/admin/danger-modal.tsx,
 *  whose cancel button is focused on a short timeout after the Dialog's own focus pass. */
function useSafeFocus(open: boolean) {
  const ref = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => ref.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [open])
  return ref
}

/** Panel chrome shared by both questions. `titleId` is what the Dialog is named by. */
function Panel({
  mark,
  titleId,
  heading,
  lead,
  children,
}: {
  /** `data-series-choice`, so a test can scope its queries to THIS dialog: the drawer is still
   *  mounted behind it and carries controls of its own. */
  mark: 'delete' | 'save'
  titleId: string
  heading: string
  lead: string
  children: React.ReactNode
}) {
  return (
    <div data-series-choice={mark} className="w-full rounded-card border border-border bg-surface p-5 lift-3">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-danger-bg text-danger">
          <AlertTriangle className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id={titleId} className="text-body font-bold text-text">
            {heading}
          </h2>
          <p className="mt-1 text-body-sm leading-relaxed text-muted">{lead}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3">{children}</div>
    </div>
  )
}

/** One choice: its button and the sentence that says what the button reaches. */
function Choice({
  id,
  label,
  note,
  variant,
  onPick,
  disabled,
  buttonRef,
}: {
  id: string
  label: string
  note: string
  variant: 'primary' | 'secondary' | 'dangerOutline'
  onPick: () => void
  disabled?: boolean
  buttonRef?: React.RefObject<HTMLButtonElement | null>
}) {
  return (
    <div className="grid gap-1">
      <div>
        <Button
          ref={buttonRef}
          type="button"
          variant={variant}
          size="sm"
          onClick={onPick}
          disabled={disabled}
          aria-describedby={`${id}-note`}
        >
          {label}
        </Button>
      </div>
      <p id={`${id}-note`} className="text-meta text-muted">
        {note}
      </p>
    </div>
  )
}

/**
 * DELETING A REPEATING ENTRY. Up to three ways out, and the destructive one says so.
 *
 * `plan.thisDate` absent (the drawer was not opened from one occurrence) drops the skip choice and
 * keeps the other two: an entry whose series delete is the only write available still gets the
 * warning, because the warning is the part that was missing.
 */
export function SeriesDeleteDialog({
  open,
  title,
  plan,
  pending,
  onChoose,
}: {
  open: boolean
  /** The entry's title, for the lead sentence. */
  title: string
  plan: SeriesDeletePlan
  /** A write is in flight: every choice is held so a second press cannot start a second write. */
  pending?: boolean
  onChoose: (choice: SeriesDeleteChoice) => void
}) {
  const keepRef = useSafeFocus(open)
  const dateLabel = plan.thisDate ? shortDateLabel(plan.thisDate) : ''
  return (
    <Dialog
      open={open}
      onClose={() => !pending && onChoose('keep')}
      ariaLabelledBy="series-delete-title"
      className="max-w-md"
    >
      <Panel mark="delete" titleId="series-delete-title" heading={SERIES_DELETE_COPY.heading} lead={SERIES_DELETE_COPY.lead(title)}>
        {plan.thisDate && (
          <Choice
            id="series-delete-this"
            label={`${SERIES_DELETE_COPY.thisDateLabel} (${dateLabel})`}
            note={SERIES_DELETE_COPY.thisDateNote(dateLabel)}
            variant="primary"
            disabled={pending}
            onPick={() => onChoose('thisDate')}
          />
        )}
        <Choice
          id="series-delete-keep"
          label={SERIES_DELETE_COPY.keepLabel}
          note="Nothing changes."
          variant="secondary"
          disabled={pending}
          onPick={() => onChoose('keep')}
          buttonRef={keepRef}
        />
        <Choice
          id="series-delete-series"
          label={SERIES_DELETE_COPY.seriesLabel}
          note={SERIES_DELETE_COPY.seriesNote}
          variant="dangerOutline"
          disabled={pending}
          onPick={() => onChoose('series')}
        />
      </Panel>
    </Dialog>
  )
}

/**
 * SAVING A REPEATING ENTRY. The warning half only (LIVE-531 scope): an edit applies to every date,
 * and the dialog says so before it lands. Editing ONE occurrence means splitting the series into
 * two rows, which is LIVE-532 and not half-built here, so the dialog names the gap and points at
 * the write that does exist.
 */
export function SeriesSaveDialog({
  open,
  title,
  pending,
  onChoose,
}: {
  open: boolean
  title: string
  pending?: boolean
  onChoose: (choice: SeriesSaveChoice) => void
}) {
  const keepRef = useSafeFocus(open)
  return (
    <Dialog
      open={open}
      onClose={() => !pending && onChoose('keep')}
      ariaLabelledBy="series-save-title"
      className="max-w-md"
    >
      <Panel mark="save" titleId="series-save-title" heading={SERIES_SAVE_COPY.heading} lead={SERIES_SAVE_COPY.lead(title)}>
        <Choice
          id="series-save-keep"
          label={SERIES_SAVE_COPY.keepLabel}
          note="Nothing is saved. The form stays as you left it."
          variant="secondary"
          disabled={pending}
          onPick={() => onChoose('keep')}
          buttonRef={keepRef}
        />
        <Choice
          id="series-save-series"
          label={SERIES_SAVE_COPY.seriesLabel}
          note={SERIES_SAVE_COPY.seriesNote}
          variant="primary"
          disabled={pending}
          onPick={() => onChoose('series')}
        />
        <p className="text-meta text-muted">{SERIES_SAVE_COPY.thisDateGap}</p>
      </Panel>
    </Dialog>
  )
}
