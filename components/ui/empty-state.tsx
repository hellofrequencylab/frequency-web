import { AlertTriangle, CheckCircle2, Inbox, Lock, SearchX } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Shared empty state — one calm pattern for every "nothing here" moment, with a named
// VARIANT taxonomy (ADR-233 §6, GitHub/Vercel): never a blank pane, always the reason +
// the next step. Variants set the default icon + tone; an explicit `icon` overrides.
//   • first-use  — nothing created yet: teach + one imperative CTA (default).
//   • no-results — a filter/search matched nothing: suggest broadening.
//   • cleared    — the queue is done: a small celebration, not a void.
//   • error      — a load failed: alert icon (no playful art), recovery action.
//   • permission — not allowed: explains the boundary (render full-page).
// Backward compatible: existing { icon, title, description, action } callers are unchanged.

type Variant = 'first-use' | 'no-results' | 'cleared' | 'error' | 'permission'

// `chip` — DAWN's icon-chip anatomy (dawn/components/feedback/EmptyState.jsx): the glyph
// sits in a soft 56px tinted square, not bare. First-use keeps DAWN's warm amber chip;
// the other variants keep this file's tone taxonomy, expressed as the chip's tint.
const VARIANT: Record<Variant, { Icon: LucideIcon; chip: string; frame: string }> = {
  'first-use': { Icon: Inbox, chip: 'bg-primary-bg text-primary-strong', frame: 'border-dashed border-border' },
  'no-results': { Icon: SearchX, chip: 'bg-surface-elevated text-muted', frame: 'border-dashed border-border' },
  cleared: { Icon: CheckCircle2, chip: 'bg-success-bg text-success', frame: 'border-dashed border-success/30' },
  error: { Icon: AlertTriangle, chip: 'bg-danger-bg text-danger', frame: 'border-danger/30' },
  permission: { Icon: Lock, chip: 'bg-surface-elevated text-muted', frame: 'border-border' },
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = 'first-use',
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  variant?: Variant
}) {
  const v = VARIANT[variant]
  const Glyph = Icon ?? v.Icon
  return (
    <div className={`rounded-card border bg-surface/50 px-6 py-12 text-center ${v.frame}`}>
      <span
        className={`mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-control ${v.chip}`}
        aria-hidden
      >
        <Glyph className="h-6 w-6" />
      </span>
      <p className="text-body-lg font-extrabold text-text">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-sm text-body-sm text-muted">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
