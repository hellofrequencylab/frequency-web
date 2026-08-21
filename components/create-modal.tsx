'use client'

import { X, Check, Loader2 } from 'lucide-react'
import { fieldClasses } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE CREATE-MODAL SHELL, NOW ON THE SHARED PRIMITIVE (ADR-1100).
//
// docs/STUDIO.md §6 says to retire this file "once circles move". Circles moved — `NewCircleCompose`
// is a bare `<Link>` and `CircleWizard` shipped — and the retirement never followed, leaving EIGHT
// consumers on a second, hand-rolled overlay implementation: its own backdrop, its own focus trap,
// its own ESC handler, its own scroll lock. None of them was a circle, and none was ever assigned
// an owner by that migration order, which is why the condition could be met and nothing happen.
//
// 🔴 WHAT THE HAND-ROLLED OVERLAY WAS ACTUALLY COSTING, beyond duplication:
//   • It did NOT portal, so any of the eight opened inside a transformed ancestor (the sliding
//     admin rail) was trapped in that ancestor's box and rendered as a narrow panel.
//   • It did NOT carry the Space theme across a portal (ADR-1097), because it had no portal.
//   • It was NOT in the dialog stack, so ESC could close it and a dialog above it at the same time.
//   • It padded a flat 0/16px, so on a notched phone its footer sat on the home indicator.
//
// The PUBLIC API IS UNCHANGED — same props, same names, same eight call sites untouched. What
// changes is who owns the chrome. This file now owns only what is genuinely its own: the header
// band, the form, the error banner and the footer buttons.
//
// The stale comment that justified the duplication said the centered `ui/Dialog` "can't express"
// a bottom sheet. That was true when it was written and is not now: `align` exists, and this is
// what `align="bottom"` was added for.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const ICON_COLORS: Record<string, { bg: string; text: string }> = {
  indigo: { bg: 'bg-primary-bg', text: 'text-primary-strong' },
  amber:  { bg: 'bg-warning-bg dark:bg-warning-bg',   text: 'text-warning' },
  green:  { bg: 'bg-success-bg',   text: 'text-success' },
  violet: { bg: 'bg-signal-bg', text: 'text-signal-strong' },
  blue:   { bg: 'bg-signal-bg',     text: 'text-signal-strong' },
}

interface CreateModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (e: React.FormEvent) => void
  title: string
  titleIcon: React.ElementType
  titleIconColor?: keyof typeof ICON_COLORS
  submitLabel: string
  pendingLabel?: string
  submitDisabled?: boolean
  isPending?: boolean
  error?: string | null
  children: React.ReactNode
}

/**
 * Responsive create-modal shell. On mobile (<sm) it renders as a bottom sheet that fills the width
 * and touches the bottom edge of the viewport. On desktop it renders as a centered modal with a
 * constrained max-width. Both come from `Dialog align="bottom"` now, not from this file.
 *
 * Parent owns open state and form data. This component owns the header (icon + title + close), the
 * form, the error banner and the footer (Cancel + Submit). Form fields go in `children`.
 */
export function CreateModal({
  open,
  onClose,
  onSubmit,
  title,
  titleIcon: Icon,
  titleIconColor = 'indigo',
  submitLabel,
  pendingLabel = 'Saving…',
  submitDisabled,
  isPending,
  error,
  children,
}: CreateModalProps) {
  const colors = ICON_COLORS[titleIconColor] ?? ICON_COLORS.indigo

  // 🔴 A PENDING SUBMIT STILL BLOCKS EVERY EXIT, and that has to be re-stated here rather than
  // inherited: `Dialog` knows nothing about a form being mid-flight, so backdrop click and ESC both
  // route through this guard, exactly as the hand-rolled overlay's did. Dropping it would let a
  // member dismiss a modal whose server action is already running.
  const close = () => {
    if (!isPending) onClose()
  }

  return (
    <Dialog open={open} onClose={close} ariaLabel={title} align="bottom" className="sm:max-w-2xl">
      <form
        onSubmit={onSubmit}
        className="flex max-h-[90vh] w-full flex-col rounded-t-2xl border border-border bg-surface lift-3 outline-none sm:max-h-[calc(100vh-4rem)] sm:rounded-2xl"
      >
        {/* Mobile drag indicator */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-pill bg-border-strong" />
        </div>

        {/* Header — a warm sand band so the title reads as a deliberate, on-brand
            header rather than plain white-on-white. */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-border bg-surface-elevated/50 sm:rounded-t-2xl shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-9 h-9 shrink-0 rounded-xl ${colors.bg} flex items-center justify-center`}>
              <Icon className={`w-[18px] h-[18px] ${colors.text}`} />
            </div>
            <h2 className="text-body-lg font-bold text-text truncate">{title}</h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="shrink-0 rounded-lg p-1.5 text-subtle hover:text-muted hover:bg-surface-elevated transition-colors"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <p className="text-meta text-danger bg-danger-bg/30 border border-danger rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          {children}
        </div>

        {/* Footer — same warm sand band as the header, bookending the form. The bottom safe-area
            padding lives HERE, not on the overlay: `align="bottom"` deliberately leaves the panel
            touching the edge, and only the panel knows which of its bands is last. Without it these
            buttons sat on a notched phone's home indicator. */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-surface-elevated/50 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-b-2xl sm:pb-4">
          <Button type="button" variant="secondary" onClick={close} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" className="lift-1" disabled={submitDisabled || isPending}>
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            <span>{isPending ? pendingLabel : submitLabel}</span>
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/**
 * Standard form-field styling shared across all create modals.
 * Use `cmInput` for inputs/selects/textareas, `cmLabel` for labels.
 */
// Focus reads as a calm, on-brand state — the border firms to the strong sand
// tone with a soft neutral halo, NOT a loud amber ring. (This class wins over the
// global amber :focus-visible ring on these fields, by specificity.)
export const cmInput = fieldClasses
export const cmLabel = 'block text-meta font-medium text-muted mb-1'
