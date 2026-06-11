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

const VARIANT: Record<Variant, { Icon: LucideIcon; tone: string; frame: string }> = {
  'first-use': { Icon: Inbox, tone: 'text-subtle', frame: 'border-dashed border-border' },
  'no-results': { Icon: SearchX, tone: 'text-subtle', frame: 'border-dashed border-border' },
  cleared: { Icon: CheckCircle2, tone: 'text-success', frame: 'border-dashed border-success/30' },
  error: { Icon: AlertTriangle, tone: 'text-danger', frame: 'border-danger/30' },
  permission: { Icon: Lock, tone: 'text-muted', frame: 'border-border' },
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
    <div className={`rounded-2xl border bg-surface/50 px-6 py-12 text-center ${v.frame}`}>
      <Glyph className={`mx-auto mb-3 h-8 w-8 ${v.tone}`} aria-hidden />
      <p className="text-sm font-semibold text-text">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
