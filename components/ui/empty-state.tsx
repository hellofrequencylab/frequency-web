import type { LucideIcon } from 'lucide-react'

// Shared empty state — one calm, encouraging pattern for "nothing here yet"
// across every browse page. Soft dashed frame, icon, a line of guidance, and an
// optional call to action. Replaces the per-page hand-rolled empties.

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/50 px-6 py-12 text-center">
      {Icon && <Icon className="mx-auto mb-3 h-8 w-8 text-subtle" />}
      <p className="text-sm font-semibold text-text">{title}</p>
      {description && (
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{description}</p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
