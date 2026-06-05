// The one page-header grammar, shared by the Index / Stream / Dashboard / Focus
// templates. Detail pages keep their richer context band (badges + tabs) but use
// the same type scale. Match this and every page's title block reads the same —
// the cohesion the audits found missing (REDESIGN-INAPP defect #1/#5).
//
// Presentational + server-friendly (no hooks).

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
  back,
  divider = true,
}: {
  /** Small contextual kicker above the title (date, section, status). */
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  /** Header-right controls — primary action / create menu / sort. */
  actions?: React.ReactNode
  /** Back-link shown above the eyebrow (Focus + nested pages). */
  back?: { href: string; label: string }
  /** Hairline under the header (default on; Focus can drop it for a lighter band). */
  divider?: boolean
}) {
  return (
    <div className={`mb-5 sm:mb-6 ${divider ? 'border-b border-border pb-4 sm:pb-5' : ''}`}>
      {back && (
        <Link
          href={back.href}
          className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-text"
        >
          <ChevronLeft className="h-4 w-4" />
          {back.label}
        </Link>
      )}
      {/* Title left, action top-right — one balanced row at every width. The title
          block is min-w-0 so a long title WRAPS rather than crushing the action,
          and the action is shrink-0 so it always keeps its place on the right. */}
      <div className="flex flex-row items-start justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-primary-strong">
              {eyebrow}
            </p>
          )}
          <h1 className="mb-1 text-balance text-xl font-bold text-text sm:text-2xl">{title}</h1>
          {description && (
            <p className="max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </div>
  )
}
