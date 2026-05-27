'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  CircleDot,
  Radio,
  CalendarDays,
  Megaphone,
  ClipboardList,
  Building2,
  Network,
  ShieldAlert,
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
  ]

  return (
    <>
      {/* Desktop vertical sidebar */}
      <nav className="hidden md:flex flex-col w-48 shrink-0 border-r border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/90 py-3 px-2 space-y-0.5 overflow-y-auto">
        {tabs.map(({ href, label, Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-indigo-50 text-indigo-700 font-semibold dark:bg-indigo-950 dark:text-indigo-300'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-50'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  active ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-600'
                }`}
                strokeWidth={active ? 2.5 : 2}
              />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Mobile horizontal scrollable tabs */}
      <div className="md:hidden border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 sticky top-0 z-20">
        <nav className="flex gap-0 px-4 overflow-x-auto">
          {tabs.map(({ href, label, Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  active
                    ? 'border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={active ? 2.5 : 2} />
                {label}
              </Link>
            )
          })}
        </nav>
      </div>
    </>
  )
}
