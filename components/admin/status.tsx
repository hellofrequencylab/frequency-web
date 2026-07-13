'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

// Admin status + feedback vocabulary (ADR-233, docs/ADMIN-DESIGN-SYSTEM.md §4). ONE
// tokenized set so every admin surface speaks the same language and the per-page
// *_STYLES / ACTION_LABEL / STATUS_STYLE dicts can be retired. Semantic tokens only.
//
//   <StatusChip tone="success">Active</StatusChip>
//   <Badge>12</Badge>
//   <Banner tone="critical" title="Form could not be saved">Two fields are empty.</Banner>

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const TONE: Record<StatusTone, string> = {
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
  info: 'bg-info-bg text-info',
  neutral: 'bg-surface-elevated text-muted',
}

/** A small status pill. The one status vocabulary across admin. */
export function StatusChip({
  tone = 'neutral',
  size = 'md',
  children,
}: {
  tone?: StatusTone
  size?: 'sm' | 'md'
  children: React.ReactNode
}) {
  const pad = size === 'sm' ? 'px-2 py-0.5 text-2xs' : 'px-2.5 py-0.5 text-xs'
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full font-semibold ${pad} ${TONE[tone]}`}>
      {children}
    </span>
  )
}

/** A count badge (neutral, tabular). */
export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-surface-elevated px-1.5 py-0.5 text-2xs font-bold tabular-nums text-muted">
      {children}
    </span>
  )
}

// The disciplined callout vocabulary (Polaris): info (low priority) / warning (needs
// attention) / critical (blocks the task, role="alert"). Only one severity per banner.
export type BannerTone = 'info' | 'warning' | 'critical'

const BANNER: Record<BannerTone, string> = {
  info: 'border-info/30 bg-info-bg text-info',
  warning: 'border-warning/30 bg-warning-bg text-warning',
  critical: 'border-danger/30 bg-danger-bg text-danger',
}

/** A page/section callout. `critical` announces itself to assistive tech. Dismissible
 *  banners manage their own hidden state (client). */
export function Banner({
  tone = 'info',
  title,
  action,
  dismissible = false,
  children,
}: {
  tone?: BannerTone
  title: React.ReactNode
  action?: React.ReactNode
  dismissible?: boolean
  children?: React.ReactNode
}) {
  const [hidden, setHidden] = useState(false)
  if (hidden) return null
  return (
    <div
      role={tone === 'critical' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${BANNER[tone]}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        {children && <div className="mt-0.5 text-sm text-text/80">{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
      {dismissible && (
        <button
          type="button"
          onClick={() => setHidden(true)}
          aria-label="Dismiss"
          className="shrink-0 rounded-md p-1 text-current/70 transition-colors hover:bg-text/5 hover:text-current"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  )
}
