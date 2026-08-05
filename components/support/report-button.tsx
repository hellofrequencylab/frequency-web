'use client'

import { Bug } from 'lucide-react'
import { openSupport } from './support-launcher'
import type { TicketType } from '@/lib/support/types'

// A button that opens the global report dialog. `variant` lets it read as a primary
// CTA, a bordered rail row (ghost), or a compact chip depending on where it lives.
export function ReportButton({
  type = 'bug',
  label = 'Report a bug',
  variant = 'primary',
  className = '',
}: {
  type?: TicketType
  label?: string
  variant?: 'primary' | 'ghost' | 'chip'
  className?: string
}) {
  // Weight is per-variant (not on `base`), so ghost can carry DAWN's 700 without two
  // font-weight utilities racing in the same class string.
  const base = 'inline-flex items-center gap-1.5 transition-colors'
  const styles =
    variant === 'primary'
      ? 'rounded-xl bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary hover:bg-primary-hover'
      : variant === 'chip'
        ? 'rounded-pill border border-border bg-surface px-3 py-1 text-meta font-semibold text-text hover:bg-surface-elevated'
        : // Ghost = DAWN's rail UtilityRow (right-rail.jsx): a bordered surface row,
          // not a bare link, so it matches the Invite row directly under it.
          'rounded-card border border-border bg-surface px-3.5 py-2.5 text-body-sm font-bold text-text hover:bg-surface-elevated'
  return (
    <button type="button" onClick={() => openSupport(type)} className={`${base} ${styles} ${className}`}>
      <Bug className="h-4 w-4 shrink-0" /> {label}
    </button>
  )
}
