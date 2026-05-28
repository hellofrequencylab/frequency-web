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
  Users,
} from 'lucide-react'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'

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
    { href: '/admin/dispatches',  label: 'Dispatches',  Icon: Megaphone },
    { href: '/admin/crew-tasks',  label: 'Crew Tasks',  Icon: ClipboardList },
    { href: '/admin/moderation',  label: 'Moderation',  Icon: ShieldAlert },
    ...(role === 'guide' || role === 'mentor' || role === 'janitor'
      ? [{ href: '/admin/hubs', label: 'Hubs', Icon: Building2 } as NavItem]
      : []),
    ...(role === 'mentor' || role === 'janitor'
      ? [{ href: '/admin/nexuses', label: 'Nexuses', Icon: Network } as NavItem]
      : []),
    ...(role === 'janitor'
      ? [{ href: '/admin/members', label: 'Members', Icon: Users } as NavItem]
      : []),
  ]

  return (
    <div className="border-b border-gray-200/60 dark:border-gray-800/60 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm sticky top-0 z-20">
      <nav className="flex overflow-x-auto px-4 gap-0 scrollbar-none">
        {tabs.map(({ href, label, Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors shrink-0 ${
                active
                  ? 'border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <Icon
                className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-500'}`}
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
