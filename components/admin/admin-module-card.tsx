import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { SidebarCard } from '@/components/ui/sidebar-card'

// The atomic "admin setting box" inside the page admin dock (EMBEDDED-ADMIN.md §2).
// Composes the shared SidebarCard base (rounded-2xl border bg-surface, bold header
// divider) and adds the module zones: a leading icon, an optional right-aligned
// status, an optional description, the control area, and an optional footer (save
// row). No hardcoded hex; semantic tokens only.

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
    <SidebarCard title={title} Icon={Icon} action={status}>
      {desc && <p className="px-4 pt-3 text-sm text-muted">{desc}</p>}
      <div className="px-4 py-3">{children}</div>
      {footer && <div className="border-t border-border px-4 py-3">{footer}</div>}
    </SidebarCard>
  )
}
