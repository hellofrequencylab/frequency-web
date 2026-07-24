'use client'

import Link from 'next/link'
import { Check, ChevronRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Shared settings-list primitives — the iOS / Discord grouped-list look: a `SettingsGroup` card wrapping
// `SettingsRow`s. Replaces the hand-rolled `SettingLink` + `divide-y` blocks copy-pasted across the member
// settings tree, the Space settings tree, and the AdminBar link rows. One row shape for a navigational
// link, an action button, or a selectable option. Semantic DAWN tokens only, no hex; ≥44px tap targets;
// app-chrome voice (no em dashes).

/** A titled card that groups rows with hairline dividers. Compose several groups down a settings screen. */
export function SettingsGroup({
  title,
  children,
  className,
}: {
  /** Optional uppercase group label above the card. */
  title?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={className}>
      {title && (
        <h2 className="mb-2 px-1 text-2xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
      )}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <ul className="divide-y divide-border">{children}</ul>
      </div>
    </section>
  )
}

/** One settings row. Renders a Link when `href` is set, a button when `onClick` is set, else a static row.
 *  A navigational row shows a trailing chevron by default; a `selected` row shows a check. */
export function SettingsRow({
  icon: Icon,
  title,
  description,
  trailing,
  href,
  onClick,
  selected = false,
  tone = 'default',
  disabled = false,
  ariaLabel,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  /** Trailing content: a value string/node. Omit to get the default chevron (navigational) or check (selected). */
  trailing?: ReactNode
  /** Navigational link row. Takes precedence over `onClick`. */
  href?: string
  /** Action row. */
  onClick?: () => void
  /** Selected/active option (e.g. the chosen theme): tints the row + icon and shows a check by default. */
  selected?: boolean
  tone?: 'default' | 'danger'
  disabled?: boolean
  ariaLabel?: string
}) {
  const navigational = Boolean(href || onClick)
  const danger = tone === 'danger'

  const rowClass = cn(
    'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
    selected ? 'bg-primary-bg/50' : navigational && !disabled ? 'hover:bg-surface-elevated' : '',
    disabled && 'opacity-60',
  )

  const inner = (
    <>
      {Icon && (
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            selected ? 'bg-primary-bg' : 'bg-surface-elevated',
          )}
        >
          <Icon
            className={cn('h-4 w-4', danger ? 'text-danger' : selected ? 'text-primary-strong' : 'text-muted')}
            aria-hidden
          />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block text-sm font-medium',
            danger ? 'text-danger' : selected ? 'text-primary-strong' : 'text-text',
          )}
        >
          {title}
        </span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-subtle">
        {trailing}
        {selected && !trailing && <Check className="h-4 w-4 text-primary-strong" aria-hidden />}
        {navigational && !selected && !trailing && <ChevronRight className="h-4 w-4 text-subtle" aria-hidden />}
      </span>
    </>
  )

  let control: ReactNode
  if (href && !disabled) {
    control = (
      <Link href={href} aria-label={ariaLabel} className={rowClass}>
        {inner}
      </Link>
    )
  } else if (onClick || disabled) {
    control = (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-pressed={onClick && selected ? true : undefined}
        className={rowClass}
      >
        {inner}
      </button>
    )
  } else {
    control = (
      <div className={rowClass} aria-label={ariaLabel}>
        {inner}
      </div>
    )
  }

  return <li>{control}</li>
}
