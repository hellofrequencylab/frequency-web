import Link from 'next/link'
import { Users, Briefcase, HeartPulse, Upload, MessagesSquare } from 'lucide-react'
import { isConsoleSpaceType, type SpaceType } from '@/lib/spaces/types'

// SPACE CRM VIEW TABS (list-first principle, docs/NEXT-GEN-CRM.md). The persistent, always-visible
// affordance that keeps the member list one tap away from anywhere in the CRM. The board lands on
// People (the familiar roster) by default; Pipeline and Cockpit are secondary views behind ?view=.
// A funnel drill or a contact detail also renders this bar (with People active), so an owner returns
// to the familiar list in one tap. URL-driven (server Links, no client state); composes kit tokens
// only; copy in voice (no em or en dashes).
//
// CONVERSATIONS DOOR (LIVE-897): the ticketed inbox at /spaces/<slug>/crm/conversations (ADR-812) is its
// own route with its own chrome, not a ?view=. The People board is where a manager goes to reach a
// contact, so the bar carries one extra link-out tab to it when the caller passes `conversationsHref`
// (a manager of a console Space, the same gate the Conversations page uses). It is never the active tab.

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

/** The Space Conversations console href for a manager of a console Space, else undefined (LIVE-897).
 *  Same gate as app/(main)/spaces/[slug]/crm/conversations/page.tsx: canManage is caps.canEditProfile,
 *  what resolveSpaceManageAccess reads as canManage. A staff preview is not a door. */
export function crmConversationsHref(slug: string, type: SpaceType, canManage: boolean): string | undefined {
  return canManage && isConsoleSpaceType(type) ? `/spaces/${slug}/crm/conversations` : undefined
}

const TAB_CLASS = 'inline-flex items-center gap-1.5 rounded-control px-3 py-1.5 text-body-sm font-semibold transition-colors tap-target'
const TAB_IDLE = 'text-muted hover:bg-surface-elevated hover:text-text'

export function CrmViewTabs({
  boardHref,
  active,
  conversationsHref,
}: {
  boardHref: string
  active: CrmView
  /** The Conversations console for this Space, when the viewer may open it (LIVE-897). Omit to hide. */
  conversationsHref?: string
}) {
  return (
    <nav aria-label="CRM views" className="flex flex-wrap gap-1 rounded-control border border-border bg-surface p-1 lift-1">
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
            className={`${TAB_CLASS} ${isActive ? 'bg-primary text-on-primary' : TAB_IDLE}`}
          >
            <Icon className="h-4 w-4" aria-hidden /> {tab.label}
          </Link>
        )
      })}
      {conversationsHref && (
        // The link-out door to the ticketed inbox (its own route, so never aria-current here).
        <Link href={conversationsHref} className={`${TAB_CLASS} ${TAB_IDLE}`}>
          <MessagesSquare className="h-4 w-4" aria-hidden /> Conversations
        </Link>
      )}
    </nav>
  )
}
