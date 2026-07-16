import Link from 'next/link'
import {
  ArrowUpRight, QrCode, Share2, GraduationCap, ToggleRight, Contact, PieChart,
  Rocket, Telescope, Bot, Link2,
  ClipboardList, Send, type LucideIcon,
} from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AdminSection } from '@/components/templates'
import { createAdminClient } from '@/lib/supabase/admin'

// Growth layout module (LP7): "Manage" — one card per working sub-page across Acquisition, CRM, and
// Marketing, each a live stat (where cheap) plus a link straight to the surface that edits it. Self-
// fetching RSC; the page owns the gate and every linked area keeps its own. Fail-safe: any read error
// degrades to honest zeros. The grids are container queries so they size to the slot they land in.

// Untyped admin handle for the funnels/applications tables (not in the generated types until regen,
// the repo-wide service-role convention, ADR-246). The SupabaseClient return annotation widens off the
// typed-table union without a client cast.
function funnelsDb(): SupabaseClient {
  return createAdminClient()
}

interface ManageCard {
  label: string
  desc: string
  stat: string
  statLabel: string
  href: string
  Icon: LucideIcon
}

interface ManageCounts {
  contacts: number
  segments: number
  campaigns: number
  sequences: number
  qr: number
  automations: number
  funnels: number
  applications: number
}

const EMPTY: ManageCounts = {
  contacts: 0, segments: 0, campaigns: 0, sequences: 0,
  qr: 0, automations: 0, funnels: 0, applications: 0,
}

async function load(): Promise<ManageCounts> {
  try {
    const admin = createAdminClient()
    // Only the cheap, verified counts read live (the same tables the KPIs above use); every other
    // surface owns its own aggregate, so its card stays "Manage" rather than invent a data source.
    const [contactsC, segmentsC, campaignsC, sequencesC, qrC, automationsC, funnelsC, applicationsC] = await Promise.all([
      admin.from('contacts').select('id', { count: 'exact', head: true }),
      admin.from('segments').select('id', { count: 'exact', head: true }),
      admin.from('campaigns').select('id', { count: 'exact', head: true }),
      admin.from('nurture_sequences').select('id', { count: 'exact', head: true }),
      admin.from('qr_codes').select('id', { count: 'exact', head: true }),
      admin.from('automation_rules').select('id', { count: 'exact', head: true }),
      // Funnels-as-object (Growth OS Engine 2) + open applications (Engine 3, GE3-4): not in the
      // generated DB types until regen, so read through the untyped admin handle (ADR-246).
      funnelsDb().from('funnels').select('id', { count: 'exact', head: true }),
      funnelsDb().from('applications').select('id', { count: 'exact', head: true }).in('status', ['pending', 'in_review']),
    ])
    return {
      contacts: contactsC.count ?? 0,
      segments: segmentsC.count ?? 0,
      campaigns: campaignsC.count ?? 0,
      sequences: sequencesC.count ?? 0,
      qr: qrC.count ?? 0,
      automations: automationsC.count ?? 0,
      funnels: funnelsC.count ?? 0,
      applications: applicationsC.count ?? 0,
    }
  } catch {
    return EMPTY
  }
}

export async function GrowthManage() {
  const c = await load()

  const acquisition: ManageCard[] = [
    { label: 'Applications', desc: 'The dual-track review queue: builders apply to host, operators bring an offering, and seekers wait for a Circle near them.', stat: `${c.applications}`, statLabel: 'open', href: '/admin/growth/applications', Icon: ClipboardList },
    { label: 'Link Generator', desc: 'Compose a trackable link with campaign tags, then generate a short link and QR to share.', stat: '', statLabel: 'Open', href: '/admin/growth/links', Icon: Link2 },
    { label: 'QR Studio', desc: 'Generate, design, and manage all QR codes.', stat: `${c.qr}`, statLabel: 'codes', href: '/admin/qr', Icon: QrCode },
    { label: 'Referrals', desc: 'The personal-code referral funnel: signups, activations, and top referrers.', stat: '', statLabel: 'Manage', href: '/admin/referrals', Icon: Share2 },
    { label: 'Walkthroughs', desc: 'Instructional walkthroughs by role and trigger.', stat: '', statLabel: 'Manage', href: '/admin/walkthroughs', Icon: GraduationCap },
    { label: 'Onboarding controls', desc: 'Turn Next Steps prompts, popups, and referrals on or off.', stat: '', statLabel: 'Manage', href: '/admin/onboarding-controls', Icon: ToggleRight },
  ]

  const crm: ManageCard[] = [
    { label: 'Contacts', desc: 'Leads, customers, and members as one record.', stat: `${c.contacts}`, statLabel: 'contacts', href: '/admin/crm/contacts', Icon: Contact },
    { label: 'Segments', desc: 'Saved audiences by tag and trait.', stat: `${c.segments}`, statLabel: 'segments', href: '/admin/segments', Icon: PieChart },
  ]

  const marketing: ManageCard[] = [
    // Composing (campaigns, funnels, automations, nurture) now lives in the Resonance CRM Marketing tab.
    { label: 'Marketing', desc: 'Compose and send email to the whole community or a section, with campaigns and funnels in one place. In the Resonance CRM.', stat: `${c.campaigns + c.funnels}`, statLabel: 'in flight', href: '/admin/crm/marketing', Icon: Send },
    { label: 'Beta waitlist', desc: 'Triage the waitlist and send invites.', stat: '', statLabel: 'Manage', href: '/admin/marketing/beta', Icon: Rocket },
    { label: 'Marketing analytics', desc: 'Sends, opens, clicks, and bounces by type.', stat: '', statLabel: 'Manage', href: '/admin/marketing/analytics', Icon: PieChart },
    { label: 'Market read', desc: 'Demand, geography, and content performance.', stat: '', statLabel: 'Manage', href: '/admin/marketing/market-read', Icon: Telescope },
    { label: 'Marketing agent', desc: 'Ask the AI operator to draft, segment, and run the busywork.', stat: '', statLabel: 'Manage', href: '/admin/marketing/agent', Icon: Bot },
  ]

  return (
    <>
      <ManageGroup
        title="Acquisition"
        description="How people first arrive and where to open the next door."
        cards={acquisition}
      />
      <ManageGroup
        title="CRM"
        description="Contacts, relationships, and the audiences they form."
        cards={crm}
      />
      <ManageGroup
        title="Marketing"
        description="Campaigns, funnels, automations, and outbound."
        cards={marketing}
      />
    </>
  )
}

function ManageGroup({ title, description, cards }: { title: string; description: string; cards: ManageCard[] }) {
  return (
    <AdminSection title={title} description={description}>
      <div className="grid gap-3 @2xl:grid-cols-2 @4xl:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-border-strong"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
                <c.Icon className="h-4 w-4" aria-hidden />
              </span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">{c.label}</p>
              <p className="mt-0.5 text-xs leading-snug text-muted">{c.desc}</p>
            </div>
            <p className="mt-auto flex items-baseline gap-1.5">
              {c.stat && <span className="text-lg font-bold tabular-nums text-text">{c.stat}</span>}
              <span className="text-2xs font-medium uppercase tracking-wide text-subtle">{c.statLabel}</span>
            </p>
          </Link>
        ))}
      </div>
    </AdminSection>
  )
}
