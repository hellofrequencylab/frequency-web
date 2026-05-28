'use client'

import { X, Check, Loader2 } from 'lucide-react'

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
        className="w-full sm:max-w-2xl sm:my-8 rounded-t-2xl sm:rounded-2xl border border-border bg-surface shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[calc(100vh-4rem)]"
      >
        {/* Mobile drag indicator */}
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-border-strong" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg ${colors.bg} flex items-center justify-center`}>
              <Icon className={`w-4 h-4 ${colors.text}`} />
            </div>
            <h2 className="text-base font-bold text-text">{title}</h2>
          </div>
          <button
            type="button"
            onClick={() => !isPending && onClose()}
            className="rounded-lg p-1.5 text-subtle hover:text-muted hover:bg-surface-elevated transition-colors"
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

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border bg-surface/50 dark:bg-canvas/50 sm:rounded-b-2xl shrink-0">
          <button
            type="button"
            onClick={() => !isPending && onClose()}
            disabled={isPending}
            className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted hover:bg-surface-elevated transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitDisabled || isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-40 transition-colors"
          >
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {isPending ? pendingLabel : submitLabel}
          </button>
        </div>
      </form>
    </div>
  )
}

/**
 * Standard form-field styling shared across all create modals.
 * Use `cmInput` for inputs/selects/textareas, `cmLabel` for labels.
 */
export const cmInput = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/40 dark:focus:ring-primary/30 disabled:opacity-50 placeholder:text-subtle'
export const cmLabel = 'block text-xs font-medium text-muted mb-1'
