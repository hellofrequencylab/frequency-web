import Link from 'next/link'
import { Users, Briefcase, HeartPulse, Upload } from 'lucide-react'

// SPACE CRM VIEW TABS (list-first principle, docs/NEXT-GEN-CRM.md). The persistent, always-visible
// affordance that keeps the member list one tap away from anywhere in the CRM. The board lands on
// People (the familiar roster) by default; Pipeline and Cockpit are secondary views behind ?view=.
// A funnel drill or a contact detail also renders this bar (with People active), so an owner returns
// to the familiar list in one tap. URL-driven (server Links, no client state); composes kit tokens
// only; copy in voice (no em or en dashes).

export type CrmView = 'people' | 'pipeline' | 'cockpit' | 'import'

interface Tab {
  view: CrmView
  label: string
  icon: typeof Users
}

// People leads: it is the front door. Pipeline and Cockpit follow. Import is the CSV bring-in,
// sealed to this Space, and sits last (a setup action, not a daily view).
const TABS: Tab[] = [
  { view: 'people', label: 'People', icon: Users },
  { view: 'pipeline', label: 'Pipeline', icon: Briefcase },
  { view: 'cockpit', label: 'Cockpit', icon: HeartPulse },
  { view: 'import', label: 'Import', icon: Upload },
]

export function CrmViewTabs({ boardHref, active }: { boardHref: string; active: CrmView }) {
  return (
    <nav aria-label="CRM views" className="flex flex-wrap gap-1 rounded-2xl border border-border bg-surface p-1 shadow-sm">
      {TABS.map((tab) => {
        const isActive = tab.view === active
        // People is the default view, so its tab points at the bare board (no ?view=), keeping the
        // front door at the clean URL.
        const href = tab.view === 'people' ? boardHref : `${boardHref}?view=${tab.view}`
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
