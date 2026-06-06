import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutTemplate, DoorOpen, Megaphone, QrCode, Link2,
  KanbanSquare, Contact, Users, ArrowRight,
  Filter, Mail, Workflow, BarChart3, Radar, Rocket,
} from 'lucide-react'
import { canAccessGrowthStudio } from '@/lib/page-editor/guard'
import { SectionHeader } from '@/components/ui/section-header'

export const dynamic = 'force-dynamic'

// Growth Studio — one home for the scattered onboarding/growth tools (the
// "Leadpages-style" suite). v1 unifies what already exists into a single launchpad;
// the deeper visual editors (entry-point/flyer designer, sequence editor, CRM deal
// editing) are the gap roadmap in ONBOARDING-BUILD-LIST §9.
const GROUPS: { title: string; items: { label: string; desc: string; href: string; icon: typeof LayoutTemplate }[] }[] = [
  {
    title: 'Pages & onboarding',
    items: [
      { label: 'Landing pages', desc: 'Build & publish your public pages (block editor)', href: '/pages', icon: LayoutTemplate },
      { label: 'Onboarding sequences', desc: 'Audience-targeted splash + induction copy', href: '/pages/sequences', icon: DoorOpen },
    ],
  },
  {
    title: 'Acquisition',
    items: [
      { label: 'Entry points', desc: 'Flyers & campaigns that bring people in', href: '/entry-points', icon: Megaphone },
      { label: 'QR Studio', desc: 'Design, route & track QR codes', href: '/admin/qr', icon: QrCode },
      { label: 'Links & codes', desc: 'Referral & personal short links', href: '/codes', icon: Link2 },
    ],
  },
  {
    title: 'Pipeline & contacts',
    items: [
      { label: 'CRM pipeline', desc: 'Deals, stages & activities', href: '/crm', icon: KanbanSquare },
      { label: 'Your contacts', desc: 'The network you’ve captured', href: '/connections', icon: Contact },
      { label: 'Contact database', desc: 'Full marketing contacts & segments', href: '/marketing/contacts', icon: Users },
    ],
  },
  {
    // The marketing suite folds in here as individual channels (IA §10.2) rather
    // than a single "hub" hop — each tool is one tap from Growth Studio.
    title: 'Marketing',
    items: [
      { label: 'Campaigns', desc: 'Plan & send broadcast campaigns', href: '/marketing/campaigns', icon: Megaphone },
      { label: 'Funnels', desc: 'Lead flows & conversion paths', href: '/marketing/funnels', icon: Filter },
      { label: 'Nurture', desc: 'Drip sequences & follow-ups', href: '/marketing/nurture', icon: Mail },
      { label: 'Automations', desc: 'Triggered journeys & rules', href: '/marketing/automations', icon: Workflow },
      { label: 'Analytics', desc: 'Funnel & campaign performance', href: '/marketing/analytics', icon: BarChart3 },
      { label: 'Market read', desc: 'Audience & demand signals', href: '/marketing/market-read', icon: Radar },
      { label: 'Beta waitlist', desc: 'Invites & onboarding queue', href: '/marketing/beta', icon: Rocket },
    ],
  },
]

export default async function GrowthStudioPage() {
  if (!(await canAccessGrowthStudio())) notFound()

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight text-text">Growth Studio</h1>
      <p className="mt-1 text-sm text-muted">
        One place to manage how people find, join, and move through Frequency — pages, onboarding,
        acquisition, and your pipeline.
      </p>

      <div className="mt-6 space-y-7">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <SectionHeader title={group.title} />
            <div className="grid gap-3 sm:grid-cols-2">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-broadcast hover:bg-broadcast-bg/20"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-broadcast-bg text-broadcast-strong">
                    <item.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 text-sm font-semibold text-text">
                      {item.label}
                      <ArrowRight className="h-3.5 w-3.5 text-subtle transition-colors group-hover:text-broadcast-strong" aria-hidden />
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted">{item.desc}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
