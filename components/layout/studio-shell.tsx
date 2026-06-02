'use client'

import { LayoutDashboard, Users, Rocket, Megaphone, Workflow, BarChart3, Sparkles, ArrowLeft } from 'lucide-react'
import AppShell, { type NavSection } from '@/components/layout/app-shell'

// Studio nav defined client-side so the icon components don't have to cross the
// server/client boundary. Rendered as an extra section in the standard AppShell.
// A "Back to Frequency" link sits up top so the marketing workspace always has a
// one-click route back to the main site.
const STUDIO_SECTIONS: NavSection[] = [
  {
    label: null,
    items: [
      { href: '/feed', label: 'Back to Frequency', Icon: ArrowLeft },
    ],
  },
  {
    label: 'Studio',
    items: [
      { href: '/studio', label: 'Dashboard', Icon: LayoutDashboard },
      { href: '/studio/contacts', label: 'Contacts', Icon: Users },
      { href: '/studio/beta', label: 'Beta waitlist', Icon: Rocket },
      { href: '/studio/campaigns', label: 'Campaigns', Icon: Megaphone },
      { href: '/studio/automations', label: 'Automations', Icon: Workflow },
      { href: '/studio/analytics', label: 'Analytics', Icon: BarChart3 },
      { href: '/studio/agent', label: 'Agent', Icon: Sparkles },
    ],
  },
]

export function StudioShell({
  profile,
  children,
}: {
  profile: React.ComponentProps<typeof AppShell>['profile']
  children: React.ReactNode
}) {
  // Studio-only sidebar: the standard chrome (logo → feed, profile card) but
  // only the Studio nav (it's used as a CRM / email marketing / pipeline tool,
  // not the member app).
  return (
    <AppShell profile={profile} extraSections={STUDIO_SECTIONS} hideAppNav>
      {children}
    </AppShell>
  )
}
