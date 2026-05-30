'use client'

import { LayoutDashboard, Users, Rocket, Megaphone, Workflow, BarChart3, Sparkles } from 'lucide-react'
import AppShell, { type NavSection } from '@/components/layout/app-shell'

// Studio nav defined client-side so the icon components don't have to cross the
// server/client boundary. Rendered as an extra section in the standard AppShell.
const STUDIO_SECTIONS: NavSection[] = [
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
  return (
    <AppShell profile={profile} extraSections={STUDIO_SECTIONS}>
      {children}
    </AppShell>
  )
}
