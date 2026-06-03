'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  CircleDot,
  Radio,
  CalendarDays,
  Megaphone,
  ClipboardList,
  Building2,
  Network,
  ShieldAlert,
  Shield,
  Users,
  Trophy,
  FlaskConical,
} from 'lucide-react'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'admin' | 'janitor'

interface NavItem {
  href: string
  label: string
  Icon: React.ElementType
  exact?: boolean
}

export function AdminSubNav({ role }: { role: CommunityRole }) {
  const pathname = usePathname()

  const tabs: NavItem[] = [
    { href: '/admin',             label: 'Overview',    Icon: LayoutDashboard, exact: true },
    { href: '/admin/circles',     label: 'Circles',     Icon: CircleDot },
    { href: '/admin/channels',    label: 'Channels',    Icon: Radio },
    { href: '/admin/events',      label: 'Events',      Icon: CalendarDays },
    { href: '/admin/dispatches',  label: 'Broadcasts',  Icon: Megaphone },
    { href: '/admin/crew-tasks',     label: 'Crew Tasks',     Icon: ClipboardList },
    { href: '/admin/gamification',  label: 'Gamification',  Icon: Trophy },
    { href: '/admin/moderation',    label: 'Moderation',    Icon: ShieldAlert },
    ...(role === 'guide' || role === 'mentor' || role === 'admin' || role === 'janitor'
      ? [{ href: '/admin/hubs', label: 'Hubs', Icon: Building2 } as NavItem]
      : []),
    ...(role === 'mentor' || role === 'admin' || role === 'janitor'
      ? [{ href: '/admin/nexuses', label: 'Nexuses', Icon: Network } as NavItem]
      : []),
    // Members + Roles stay janitor-only — the most sensitive keys (member
    // management and the permission grid) are not handed to admins.
    ...(role === 'janitor'
      ? [
          { href: '/admin/members', label: 'Members', Icon: Users } as NavItem,
          { href: '/admin/roles', label: 'Roles', Icon: Shield } as NavItem,
          { href: '/admin/demo', label: 'Demo', Icon: FlaskConical } as NavItem,
          { href: '/admin/help-gaps', label: 'Help gaps', Icon: ClipboardList } as NavItem,
        ]
      : []),
  ]

  return (
    <div className="border-b border-border bg-surface/95 backdrop-blur-sm sticky top-0 z-20">
      <nav className="flex overflow-x-auto px-4 gap-0 scrollbar-none">
        {tabs.map(({ href, label, Icon, exact }) => {
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
