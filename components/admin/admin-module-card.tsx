import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

// The atomic "admin setting box" inside the page admin dock (EMBEDDED-ADMIN.md §2).
// Same chrome as SidebarCard (rounded-2xl border bg-surface, bold header divider),
// plus the module zones: a leading icon, an optional right-aligned status, an
// optional description, the control area, and an optional footer (save row). No
// hardcoded hex; semantic tokens only.

export function AdminModuleCard({
  title,
  Icon,
  desc,
  status,
  children,
  footer,
}: {
  title: string
  Icon?: LucideIcon
  desc?: string
  status?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-primary-strong" />}
        <h3 className="flex-1 text-sm font-bold text-text">{title}</h3>
        {status}
      </div>
      {desc && <p className="px-4 pt-3 text-sm text-muted">{desc}</p>}
      <div className="px-4 py-3">{children}</div>
      {footer && <div className="border-t border-border px-4 py-3">{footer}</div>}
    </div>
  )
}
