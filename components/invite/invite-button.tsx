'use client'

import { UserPlus } from 'lucide-react'
import { openInvite } from './invite-launcher'

// A button that opens the global Invite modal. Drop it anywhere an "Invite friends"
// CTA belongs; `variant` styles it as a primary CTA, a quiet link, or a chip.
export function InviteButton({
  label = 'Invite friends',
  variant = 'primary',
  className = '',
}: {
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
    <button type="button" onClick={() => openInvite()} className={`${base} ${styles} ${className}`}>
      <UserPlus className="h-4 w-4 shrink-0" /> {label}
    </button>
  )
}
