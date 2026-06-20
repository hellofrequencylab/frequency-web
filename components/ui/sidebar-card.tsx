import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

// Shared admin/rail sidebar card — a titled panel with a header divider. Extracted
// from 9 byte-identical local copies across the admin pages (post-overhaul
// streamlining) and unified with the community-sidebar copy (which added `count`).
// Distinct from the borderless ModuleCard: this keeps a light box because admin
// side panels read as discrete tool surfaces. `AdminModuleCard` composes this same
// base with extra zones (icon, status, desc, footer).

export function SidebarCard({
  title,
  count,
  Icon,
  action,
  children,
}: {
  title: ReactNode
  /** Optional count shown next to the title (e.g. "Online now 4"). */
  count?: number
  /** Optional leading icon in the header. */
  Icon?: LucideIcon
  /** Optional right-aligned header slot (e.g. a status chip). */
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-primary-strong" />}
        <h3 className="flex-1 flex items-baseline gap-2 text-sm font-bold text-text">
          {title}
          {count != null && (
            <span className="text-xs font-medium tabular-nums text-subtle">{count}</span>
          )}
        </h3>
        {action}
      </div>
      {children}
    </div>
  )
}
