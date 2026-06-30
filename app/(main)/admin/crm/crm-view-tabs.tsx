import Link from 'next/link'
import { Users, HeartPulse } from 'lucide-react'

// PLATFORM RESONANCE CRM VIEW TABS (list-first principle, docs/NEXT-GEN-CRM.md). The persistent,
// always-visible affordance that keeps the member roster one tap away from anywhere in the platform
// CRM, mirroring the Space CRM CrmViewTabs (People / Pipeline / Cockpit). The cockpit lands on
// Members (the familiar roster) by default; the Cockpit (worklist + funnel + rising + trust) is the
// secondary view behind ?view=cockpit. A tier / lifecycle drill also renders this bar (Members
// active), so an operator returns to the familiar list in one tap. URL-driven (server Links, no
// client state); composes kit tokens only; copy in voice (no em or en dashes).

export type CrmAdminView = 'members' | 'cockpit'

interface Tab {
  view: CrmAdminView
  label: string
  icon: typeof Users
}

// Members leads: it is the front door. Cockpit follows.
const TABS: Tab[] = [
  { view: 'members', label: 'Members', icon: Users },
  { view: 'cockpit', label: 'Cockpit', icon: HeartPulse },
]

export function CrmViewTabs({ boardHref, active }: { boardHref: string; active: CrmAdminView }) {
  return (
    <nav aria-label="CRM views" className="flex flex-wrap gap-1 rounded-2xl border border-border bg-surface p-1 shadow-sm">
      {TABS.map((tab) => {
        const isActive = tab.view === active
        // Members is the default view, so its tab points at the bare cockpit URL (no ?view=), keeping
        // the front door at the clean URL.
        const href = tab.view === 'members' ? boardHref : `${boardHref}?view=${tab.view}`
        const Icon = tab.icon
        return (
          <Link
            key={tab.view}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors ${
              isActive
                ? 'bg-primary text-on-primary'
                : 'text-muted hover:bg-surface-elevated hover:text-text'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden /> {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
