import Link from 'next/link'
import {
  Users,
  Rocket,
  Megaphone,
  Workflow,
  BarChart3,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

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

export default function StudioDashboard() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-text mb-1">Studio</h1>
      <p className="text-sm text-muted leading-relaxed max-w-2xl mb-6">
        The business cockpit. Contacts, campaigns, automations, analytics, and the AI
        operator live here. Everything sends through the one spine and reads from the
        one event backbone.
      </p>

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
