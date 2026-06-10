'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Rocket,
  Megaphone,
  Workflow,
  BarChart3,
  Radar,
  Filter,
  Mail,
} from 'lucide-react'

interface NavItem {
  href: string
  label: string
  Icon: React.ElementType
  exact?: boolean
}

// Marketing workspace tabs — the same tools the old Studio shell carried, now a
// horizontal bar inside the normal app frame (mirrors the Admin sub-nav).
const TABS: NavItem[] = [
  { href: '/admin/marketing',             label: 'Overview',     Icon: LayoutDashboard, exact: true },
  { href: '/admin/marketing/contacts',    label: 'Contacts',     Icon: Users },
  { href: '/admin/marketing/beta',        label: 'Beta waitlist', Icon: Rocket },
  { href: '/admin/marketing/campaigns',   label: 'Campaigns',    Icon: Megaphone },
  { href: '/admin/marketing/funnels',     label: 'Funnels',      Icon: Filter },
  { href: '/admin/marketing/nurture',     label: 'Nurture',      Icon: Mail },
  { href: '/admin/marketing/automations', label: 'Automations',  Icon: Workflow },
  { href: '/admin/marketing/analytics',   label: 'Analytics',    Icon: BarChart3 },
  { href: '/admin/marketing/market-read', label: 'Market read',  Icon: Radar },
]

export function MarketingSubNav() {
  const pathname = usePathname()

  return (
    <div className="border-b border-border bg-surface/95 backdrop-blur-sm sticky top-0 z-20">
      <nav className="flex overflow-x-auto px-4 gap-0 scrollbar-none">
        {TABS.map(({ href, label, Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors shrink-0 ${
                active
                  ? 'border-primary text-primary-strong dark:border-primary dark:text-primary-strong'
                  : 'border-transparent text-muted hover:text-text hover:border-border-strong dark:hover:border-border-strong'
              }`}
            >
              <Icon
                className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-primary-strong' : 'text-subtle'}`}
                strokeWidth={active ? 2.5 : 2}
              />
              {label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
