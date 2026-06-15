import { Suspense } from 'react'
import { Users, Rocket, Megaphone, Workflow, BarChart3, Sparkles } from 'lucide-react'
import { getPracticeMetrics } from '@/lib/analytics/practice'
import { getStudioCounts } from '@/lib/studio/analytics'
import { AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { AdminAreaGrid } from '@/components/admin/admin-area-grid'
import { FreshnessNote } from '@/components/admin/freshness-note'
import type { AdminLink } from '@/app/(main)/admin/sections'

// The "Marketing" tab of the consolidated Growth workspace (ADR-264) — formerly
// /admin/marketing. Live KPIs over the marketing tools. The tool sub-routes
// (/admin/marketing/contacts, /campaigns, /funnels, /automations, /analytics, /agent, …)
// survive and keep their own capability gate via app/(main)/admin/marketing/layout.tsx.
const MODULES: AdminLink[] = [
  { href: '/admin/marketing/contacts', label: 'Contacts', Icon: Users, min: 'host', desc: 'The unified CRM record for leads, customers, and members.' },
  { href: '/admin/marketing/beta', label: 'Beta waitlist', Icon: Rocket, min: 'host', desc: 'Everyone who raised a hand. Triage the list and send invites.' },
  { href: '/admin/marketing/campaigns', label: 'Campaigns', Icon: Megaphone, min: 'host', desc: 'Compose and send broadcasts (email and push) through the one spine.' },
  { href: '/admin/marketing/automations', label: 'Automations', Icon: Workflow, min: 'host', desc: 'Rules that react to the event backbone: welcomes, nudges, follow-ups.' },
  { href: '/admin/marketing/analytics', label: 'Analytics', Icon: BarChart3, min: 'host', desc: 'How it lands. Sends, opens, and engagement read from the one backbone.' },
  { href: '/admin/marketing/agent', label: 'Agent', Icon: Sparkles, min: 'host', desc: 'The AI operator. Ask it to draft, segment, and run the busywork.' },
]

export function MarketingTab() {
  return (
    <>
      <AdminSection
        title="At a glance"
        description="Live signal, read from the same models as the analytics workspace."
        actions={<FreshnessNote at={new Date()} />}
      >
        <Suspense fallback={<KpiSkeleton />}>
          <MarketingKpis />
        </Suspense>
      </AdminSection>

      <AdminSection title="Workspace" description="Every marketing tool, one tap away.">
        <AdminAreaGrid links={MODULES} />
      </AdminSection>
    </>
  )
}

async function MarketingKpis() {
  // Defensive: the dashboard should never error on a data hiccup.
  const [practice, counts] = await Promise.all([
    getPracticeMetrics().catch(() => null),
    getStudioCounts().catch(() => null),
  ])

  if (!practice) {
    return (
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatCard label="Contacts" value={(counts?.contacts ?? 0).toLocaleString()} href="/admin/marketing/contacts" />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
      <StatCard label="Weekly Active Members" value={practice.wam.toLocaleString()} href="/admin/marketing/analytics" />
      <StatCard label="Activation 7d" value={`${Math.round(practice.activationRate * 100)}%`} href="/admin/marketing/analytics" />
      <StatCard label="New members 30d" value={practice.newMembers.toLocaleString()} href="/admin/marketing/analytics" />
      <StatCard label="Contacts" value={(counts?.contacts ?? 0).toLocaleString()} href="/admin/marketing/contacts" />
    </div>
  )
}

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-elevated/70" />
      ))}
    </div>
  )
}
