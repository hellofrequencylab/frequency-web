'use client'

import { Bug } from 'lucide-react'
import { openSupport } from './support-launcher'
import type { TicketType } from '@/lib/support/types'

// A button that opens the global report dialog. `variant` lets it read as a primary
// CTA, a quiet link, or a compact chip depending on where it lives.
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
  const base = 'inline-flex items-center gap-1.5 font-semibold transition-colors'
  const styles =
    variant === 'primary'
      ? 'rounded-xl bg-primary px-4 py-2 text-sm text-on-primary hover:bg-primary-hover'
      : variant === 'chip'
        ? 'rounded-full border border-border bg-surface px-3 py-1 text-xs text-text hover:bg-surface-elevated'
        : 'rounded-lg px-2 py-1.5 text-sm text-muted hover:text-text'
  return (
    <button type="button" onClick={() => openSupport(type)} className={`${base} ${styles} ${className}`}>
      <Bug className="h-4 w-4 shrink-0" /> {label}
    </button>
  )
}
