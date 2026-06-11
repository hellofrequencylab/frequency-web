import Link from 'next/link'
import { Users, Mail, Rocket } from 'lucide-react'

// The Members / Subscribers / Beta switch (ADR-233 §3 tabbed Index). These tabs are
// query-state (?view=) on ONE route, not sibling URL segments, so they can't use
// UnderlineTabs (which keys off pathname). Same underlined visual grammar, server
// -rendered active state from the resolved tab.

const TABS = [
  { key: 'members', label: 'Members', href: '/admin/members', Icon: Users },
  { key: 'subscribers', label: 'Subscribers', href: '/admin/members?view=subscribers', Icon: Mail },
  { key: 'beta', label: 'Beta invites', href: '/admin/members?view=beta', Icon: Rocket },
] as const

export function MembersTabs({ active }: { active: 'members' | 'subscribers' | 'beta' }) {
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto border-b border-border" aria-label="Member lists">
      {TABS.map(({ key, label, href, Icon }) => {
        const isActive = active === key
        return (
          <Link
            key={key}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors motion-reduce:transition-none ${
              isActive
                ? 'border-primary-strong text-text'
                : 'border-transparent text-muted hover:border-border-strong hover:text-text'
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
