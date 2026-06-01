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

export const dynamic = 'force-dynamic'

// Studio dashboard: the entry hall to the business cockpit. Every module that
// lives in the Studio nav also gets a card here, so the dashboard is a real
// index of the cockpit rather than a single Contacts link. Cards mirror the
// nav in components/layout/studio-shell.tsx (same icons, same order).
type Module = {
  href: string
  label: string
  Icon: LucideIcon
  description: string
}

const MODULES: Module[] = [
  {
    href: '/studio/contacts',
    label: 'Contacts',
    Icon: Users,
    description: 'The unified CRM record for leads, customers, and members.',
  },
  {
    href: '/studio/beta',
    label: 'Beta waitlist',
    Icon: Rocket,
    description: 'Everyone who raised a hand. Triage the list and send invites.',
  },
  {
    href: '/studio/campaigns',
    label: 'Campaigns',
    Icon: Megaphone,
    description: 'Compose and send broadcasts — email and push — through the one spine.',
  },
  {
    href: '/studio/automations',
    label: 'Automations',
    Icon: Workflow,
    description: 'Rules that react to the event backbone: welcomes, nudges, follow-ups.',
  },
  {
    href: '/studio/analytics',
    label: 'Analytics',
    Icon: BarChart3,
    description: 'How it lands. Sends, opens, and engagement read from the one backbone.',
  },
  {
    href: '/studio/agent',
    label: 'Agent',
    Icon: Sparkles,
    description: 'The AI operator. Ask it to draft, segment, and run the busywork.',
  },
]

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm p-4">
      <p className="text-xs text-muted font-medium">{label}</p>
      <p className="mt-1 text-2xl font-bold leading-none text-text">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  )
}

export default async function StudioDashboard() {
  // Live KPIs at a glance — reuses the same read-models as /studio/analytics.
  // Defensive: the dashboard should never error on a data hiccup.
  const [practice, counts] = await Promise.all([
    getPracticeMetrics().catch(() => null),
    getStudioCounts().catch(() => null),
  ])

  return (
    <div>
      <h1 className="text-2xl font-bold text-text mb-1">Studio</h1>
      <p className="text-sm text-muted leading-relaxed max-w-2xl mb-6">
        The business cockpit. Contacts, campaigns, automations, analytics, and the AI
        operator live here. Everything sends through the one spine and reads from the
        one event backbone.
      </p>

      {practice && (
        <section className="mb-8 max-w-2xl">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-subtle">
              At a glance
            </h2>
            <Link
              href="/studio/analytics"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary-strong hover:underline"
            >
              Full analytics <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Weekly Active Members" value={practice.wam} />
            <Kpi label="Activation 7d" value={`${Math.round(practice.activationRate * 100)}%`} />
            <Kpi label="New members 30d" value={practice.newMembers} />
            <Kpi label="Contacts" value={counts?.contacts ?? 0} />
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
    </div>
  )
}
