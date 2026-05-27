'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor'

export function AdminSubNav({ role }: { role: CommunityRole }) {
  const pathname = usePathname()

  const tabs = [
    { href: '/admin',              label: 'Overview',   exact: true  },
    { href: '/admin/dispatches',  label: 'Dispatches', exact: false },
    { href: '/admin/circles',     label: 'Circles',    exact: false },
    { href: '/admin/channels',    label: 'Channels',   exact: false },
    { href: '/admin/events',      label: 'Events',     exact: false },
    { href: '/admin/crew-tasks',  label: 'Crew Tasks', exact: false },
    ...(role === 'guide' || role === 'mentor'
      ? [{ href: '/admin/hubs', label: 'Hubs', exact: false }]
      : []),
    ...(role === 'mentor'
      ? [{ href: '/admin/nexuses', label: 'Nexuses', exact: false }]
      : []),
  ]

  return (
    <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 sticky top-0 z-20">
      <nav className="flex gap-0 px-6 overflow-x-auto justify-center">
        {tabs.map(({ href, label, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-gray-900 dark:border-gray-50 text-gray-900 dark:text-gray-50'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
