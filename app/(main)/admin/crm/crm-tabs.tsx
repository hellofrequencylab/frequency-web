'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { KanbanSquare, Users } from 'lucide-react'

// Shared tab bar across the CRM suite — Pipeline (deals board + deal detail) and
// Contacts (the unified member/lead roster).
const TABS = [
  { href: '/admin/crm', label: 'Pipeline', Icon: KanbanSquare, match: (p: string) => p === '/admin/crm' || p.startsWith('/admin/crm/deals') },
  { href: '/admin/crm/contacts', label: 'Contacts', Icon: Users, match: (p: string) => p.startsWith('/admin/crm/contacts') },
] as const

export function CrmTabs() {
  const pathname = usePathname()
  return (
    <div className="-mt-2 mb-6 flex gap-1 border-b border-border">
      {TABS.map((t) => {
        const active = t.match(pathname)
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
              active ? 'border-primary text-text' : 'border-transparent text-muted hover:text-text'
            }`}
          >
            <t.Icon className="h-4 w-4" />
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
