import { AlertTriangle, CheckCircle2, Inbox, Lock, SearchX } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// The members kit's `.empty` state in a soft room of its own (ADR-1737): the glyph in the
// kit's `.ic` chip on the pastel wash, the title in `.h3`, the line in `.t2`
// (app/themes/frequency/members-ui.css `mu-empty`; `data-tone` keys the error and cleared chips).

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

const VARIANT_ICON: Record<Variant, LucideIcon> = {
  'first-use': Inbox,
  'no-results': SearchX,
  cleared: CheckCircle2,
  error: AlertTriangle,
  permission: Lock,
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
  const Glyph = Icon ?? VARIANT_ICON[variant]
  return (
    <div className="empty mu-empty" data-tone={variant}>
      <span className="ic" aria-hidden>
        <Glyph />
      </span>
      <p className="h3">{title}</p>
      {description && <p className="t2">{description}</p>}
      {action && <div className="mu-act">{action}</div>}
    </div>
  )
}
