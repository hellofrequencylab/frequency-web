import type { ReactNode } from 'react'

// EDITOR SHELL — the ONE master container for any on-page editor "app". It lifts the whole editing surface off
// the warm page canvas onto a WHITE panel (bg-surface), so everything inside the shell reads as a single,
// self-contained app: the compose fields, the block rail, the live preview, the send bar. Install it anywhere
// an operator edits an entity on-page (the beta email editor today; Space / profile / white-label editors
// next) so every editor wears the same frame. Composes the kit — semantic DAWN tokens only, no hardcoded hex,
// no bespoke layout. Voice canon: any copy passed in must stay plain (no em dashes).
//
// Slots: `title` (+ optional `eyebrow`) render the shell's header; `actions` sit opposite the title (e.g. a
// mode toggle or a status pill); `children` are the editor body. Pass no title/actions for a chrome-less shell
// that is purely the white panel. The header hides itself when empty.

export function EditorShell({
  title,
  eyebrow,
  actions,
  children,
  className = '',
  bodyClassName = '',
}: {
  /** The shell's heading (left). Omit for a header-less white panel. */
  title?: ReactNode
  /** A small uppercase label above the title (optional). */
  eyebrow?: ReactNode
  /** Controls rendered opposite the title (optional). */
  actions?: ReactNode
  /** The editor body. */
  children: ReactNode
  /** Extra classes on the outer white panel. */
  className?: string
  /** Extra classes on the padded body wrapper. */
  bodyClassName?: string
}) {
  const hasHeader = Boolean(title || eyebrow || actions)
  return (
    <div className={`overflow-hidden rounded-3xl border border-border bg-surface shadow-md ${className}`}>
      {hasHeader && (
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">{eyebrow}</p>
            )}
            {title && <h2 className="truncate text-base font-bold text-text">{title}</h2>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={`p-5 sm:p-6 ${bodyClassName}`}>{children}</div>
    </div>
  )
}
