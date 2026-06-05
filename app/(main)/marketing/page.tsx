import Link from 'next/link'
import {
  Users,
  Rocket,
  Megaphone,
  Workflow,
  BarChart3,
  Sparkles,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react'
import { getPracticeMetrics } from '@/lib/analytics/practice'
import { getStudioCounts } from '@/lib/studio/analytics'
import { DashboardTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { SectionHeader } from '@/components/ui/section-header'

export const dynamic = 'force-dynamic'

// Marketing overview: the entry hall to the workspace. Every tool in the
// Marketing tab bar also gets a card here, so the overview is a real index
// rather than a single Contacts link. Cards mirror the tabs in
// app/(main)/marketing/sub-nav.tsx (same icons, same order).
type Module = {
  href: string
  label: string
  Icon: LucideIcon
  description: string
}

const MODULES: Module[] = [
  {
    href: '/marketing/contacts',
    label: 'Contacts',
    Icon: Users,
    description: 'The unified CRM record for leads, customers, and members.',
  },
  {
    href: '/marketing/beta',
    label: 'Beta waitlist',
    Icon: Rocket,
    description: 'Everyone who raised a hand. Triage the list and send invites.',
  },
  {
    href: '/marketing/campaigns',
    label: 'Campaigns',
    Icon: Megaphone,
    description: 'Compose and send broadcasts — email and push — through the one spine.',
  },
  {
    href: '/marketing/automations',
    label: 'Automations',
    Icon: Workflow,
    description: 'Rules that react to the event backbone: welcomes, nudges, follow-ups.',
  },
  {
    href: '/marketing/analytics',
    label: 'Analytics',
    Icon: BarChart3,
    description: 'How it lands. Sends, opens, and engagement read from the one backbone.',
  },
  {
    href: '/marketing/agent',
    label: 'Agent',
    Icon: Sparkles,
    description: 'The AI operator. Ask it to draft, segment, and run the busywork.',
  },
]

export default async function MarketingOverview() {
  // Live KPIs at a glance — reuses the same read-models as /marketing/analytics.
  // Defensive: the dashboard should never error on a data hiccup.
  const [practice, counts] = await Promise.all([
    getPracticeMetrics().catch(() => null),
    getStudioCounts().catch(() => null),
  ])

  return (
    <DashboardTemplate
      eyebrow="Marketing"
      title="Marketing"
      description="Your marketing workspace. Contacts, campaigns, automations, analytics, and the AI operator live here. Everything sends through the one spine and reads from the one event backbone."
    >
      {practice && (
        <section className="max-w-2xl">
          <SectionHeader
            title="At a glance"
            action={
              <Link
                href="/marketing/analytics"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary-strong hover:underline"
              >
                Full analytics <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Weekly Active Members" value={practice.wam.toLocaleString()} />
            <StatCard label="Activation 7d" value={`${Math.round(practice.activationRate * 100)}%`} />
            <StatCard label="New members 30d" value={practice.newMembers.toLocaleString()} />
            <StatCard label="Contacts" value={(counts?.contacts ?? 0).toLocaleString()} />
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        {MODULES.map(({ href, label, Icon, description }) => (
          <Link
            key={href}
            href={href}
            className="rounded-2xl border border-border bg-surface shadow-sm p-4 hover:border-primary-bg transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon className="w-4 h-4 text-primary-strong" />
              <h2 className="text-sm font-semibold text-text">{label}</h2>
            </div>
            <p className="text-xs text-muted">{description}</p>
          </Link>
        ))}
      </div>
    </DashboardTemplate>
  )
}
