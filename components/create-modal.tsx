'use client'

import { useEffect } from 'react'
import { X, Check, Loader2 } from 'lucide-react'
import { fieldClasses } from '@/components/ui/field'
import { Button } from '@/components/ui/button'

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
 * Responsive create-modal shell. On mobile (<sm) it renders as a
 * bottom sheet that fills the width and touches the bottom edge of
 * the viewport. On desktop it renders as a centered modal with a
 * constrained max-width.
 *
 * Parent owns open state and form data. This component handles the
 * overlay, layout, header (icon + title + close), and footer
 * (Cancel + Submit). Form fields go in `children`.
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
  // ESC to close + body scroll-lock while open (mirrors ui/Dialog; CreateModal keeps
  // its own bottom-sheet-on-mobile layout, which the centered Dialog can't express).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isPending) onClose() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose, isPending])

  if (!open) return null

  const colors = ICON_COLORS[titleIconColor] ?? ICON_COLORS.indigo

  return (
    <div
      onClick={() => !isPending && onClose()}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
    >
      <form
        onSubmit={onSubmit}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full sm:max-w-2xl sm:my-8 rounded-t-2xl sm:rounded-2xl border border-border bg-surface shadow-xl flex flex-col max-h-[90vh] sm:max-h-[calc(100vh-4rem)]"
      >
        {/* Mobile drag indicator */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-border-strong" />
        </div>

        {/* Header — a warm sand band so the title reads as a deliberate, on-brand
            header rather than plain white-on-white. */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-border bg-surface-elevated/50 sm:rounded-t-2xl shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-9 h-9 shrink-0 rounded-xl ${colors.bg} flex items-center justify-center`}>
              <Icon className={`w-[18px] h-[18px] ${colors.text}`} />
            </div>
            <h2 className="text-lg font-bold text-text truncate">{title}</h2>
          </div>
          <button
            type="button"
            onClick={() => !isPending && onClose()}
            className="shrink-0 rounded-lg p-1.5 text-subtle hover:text-muted hover:bg-surface-elevated transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <p className="text-xs text-danger bg-danger-bg/30 border border-danger rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          {children}
        </div>

        {/* Footer — same warm sand band as the header, bookending the form. */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border bg-surface-elevated/50 sm:rounded-b-2xl shrink-0">
          <Button type="button" variant="secondary" onClick={() => !isPending && onClose()} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" className="shadow-sm" disabled={submitDisabled || isPending}>
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            <span className="text-emboss">{isPending ? pendingLabel : submitLabel}</span>
          </Button>
        </div>
      </form>
    </div>
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
export const cmLabel = 'block text-xs font-medium text-muted mb-1'
