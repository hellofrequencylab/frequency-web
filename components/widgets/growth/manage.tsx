import Link from 'next/link'
import {
  ArrowUpRight, QrCode, Share2, GraduationCap, ToggleRight, Contact, PieChart,
  Telescope, Bot, LayoutDashboard,
  Send, type LucideIcon,
} from 'lucide-react'
import { AdminSection } from '@/components/templates'
import { canUseLink, type AdminLink } from '@/app/(main)/admin/sections'
import { studioLeaf } from '@/lib/nav/studio'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getStaffMember } from '@/lib/staff'
import type { CommunityRole, WebRole } from '@/lib/core/roles'
import type { StaffRole } from '@/lib/core/staff-roles'

// Growth layout module (LP7): "Manage" — one card per working sub-page across Acquisition, CRM, and
// Marketing, each a live stat (where cheap) plus a link straight to the surface that edits it. Self-
// fetching RSC; the page owns the gate and every linked area keeps its own. Fail-safe: any read error
// degrades to honest zeros. The grids are container queries so they size to the slot they land in.
//
// THE DESTINATIONS ARE DERIVED, NOT TYPED (SCAN-503). Label, description, href, icon and GATE all
// come from the one nav catalog (lib/nav/studio.ts::STUDIO_LEAVES) via `studioLeaf(id)`. This file
// declares only what the catalog cannot know: which leaves belong in which group here, and the live
// stat under each. While the cards were hand-declared the copy drifted from the leaf `desc` and the
// cards carried NO gate, so a host+marketing viewer was offered janitor-gated destinations that
// bounce on click — and `check:menu` is structurally blind to a list rendered by a page
// (docs/MENU-CONTRACT.md §"What is NOT enforced").

/** A destination card: the catalog's link, plus the live stat this dashboard reads for it. */
type ManageCard = AdminLink & { stat: string; statLabel: string }

/** What this dashboard adds to a leaf: which one, and the stat beneath it. */
type CardSpec = { leaf: string; stat: string; statLabel: string }

/** lucide icon NAME → component, for the leaves listed below. The catalog stores names
 *  (framework-free); app/(main)/admin/sections.ts keeps the same map for its own consumers but
 *  does not export the resolver, so the widget resolves the handful of names it renders. */
const ICONS: Record<string, LucideIcon> = {
  QrCode, Share2, GraduationCap, ToggleRight, Contact, PieChart, Telescope, Bot, Send,
}

interface ViewerRoles {
  role: CommunityRole
  webRole: WebRole
  staffRole: StaffRole | null
}

/** The viewer's three role axes, read the same way the sibling "Related areas" module reads them
 *  (components/widgets/growth/related.tsx). Null on a signed-out or failed read, which hides the
 *  section rather than showing destinations we cannot prove the viewer may enter. */
async function loadRoles(): Promise<ViewerRoles | null> {
  try {
    const [profile, staff] = await Promise.all([
      getCallerProfile(),
      getStaffMember().catch(() => null),
    ])
    if (!profile) return null
    return { role: profile.community_role, webRole: profile.webRole, staffRole: staff?.role ?? null }
  } catch {
    return null
  }
}

/** Resolve each spec against the catalog and drop what this viewer may not use. `canUseLink` is the
 *  SAME gate the admin rail and both consoles apply, so a card can never offer a destination that
 *  bounces. A spec naming a leaf that no longer exists drops out rather than rendering a dead card. */
function cardsFor(specs: readonly CardSpec[], viewer: ViewerRoles): ManageCard[] {
  return specs.flatMap((spec) => {
    const leaf = studioLeaf(spec.leaf)
    if (!leaf) return []
    const link: AdminLink = {
      href: leaf.href,
      label: leaf.label,
      desc: leaf.desc,
      Icon: ICONS[leaf.icon] ?? LayoutDashboard,
      min: leaf.min,
    }
    if (leaf.staffDomain) link.staffDomain = leaf.staffDomain
    if (leaf.staffLevel) link.staffLevel = leaf.staffLevel
    if (!canUseLink(link, viewer.role, viewer.webRole, viewer.staffRole)) return []
    return [{ ...link, stat: spec.stat, statLabel: spec.statLabel }]
  })
}

interface ManageCounts {
  contacts: number
  segments: number
  campaigns: number
  sequences: number
  qr: number
  automations: number
  funnels: number
}

const EMPTY: ManageCounts = {
  contacts: 0, segments: 0, campaigns: 0, sequences: 0,
  qr: 0, automations: 0, funnels: 0,
}

async function load(): Promise<ManageCounts> {
  try {
    const admin = createAdminClient()
    // Only the cheap, verified counts read live (the same tables the KPIs above use); every other
    // surface owns its own aggregate, so its card stays "Manage" rather than invent a data source.
    const [contactsC, segmentsC, campaignsC, sequencesC, qrC, automationsC, funnelsC] = await Promise.all([
      admin.from('contacts').select('id', { count: 'exact', head: true }),
      admin.from('segments').select('id', { count: 'exact', head: true }),
      admin.from('campaigns').select('id', { count: 'exact', head: true }),
      admin.from('nurture_sequences').select('id', { count: 'exact', head: true }),
      admin.from('qr_codes').select('id', { count: 'exact', head: true }),
      admin.from('automation_rules').select('id', { count: 'exact', head: true }),
      // Funnels-as-object (Growth OS Engine 2).
      admin.from('funnels').select('id', { count: 'exact', head: true }),
    ])
    return {
      contacts: contactsC.count ?? 0,
      segments: segmentsC.count ?? 0,
      campaigns: campaignsC.count ?? 0,
      sequences: sequencesC.count ?? 0,
      qr: qrC.count ?? 0,
      automations: automationsC.count ?? 0,
      funnels: funnelsC.count ?? 0,
    }
  } catch {
    return EMPTY
  }
}

export async function GrowthManage() {
  const [c, viewer] = await Promise.all([load(), loadRoles()])
  if (!viewer) return null

  const acquisition = cardsFor(
    [
      { leaf: 'growth-links', stat: '', statLabel: 'Open' },
      { leaf: 'qr', stat: `${c.qr}`, statLabel: 'codes' },
      { leaf: 'referrals', stat: '', statLabel: 'Manage' },
      { leaf: 'walkthroughs', stat: '', statLabel: 'Manage' },
      { leaf: 'onboarding-controls', stat: '', statLabel: 'Manage' },
    ],
    viewer,
  )

  const crm = cardsFor(
    [
      { leaf: 'crm-contacts', stat: `${c.contacts}`, statLabel: 'contacts' },
      { leaf: 'segments', stat: `${c.segments}`, statLabel: 'segments' },
    ],
    viewer,
  )

  // Composing (campaigns, funnels, automations, nurture) now lives in the Resonance CRM Marketing tab.
  const marketing = cardsFor(
    [
      { leaf: 'crm-marketing', stat: `${c.campaigns + c.funnels}`, statLabel: 'in flight' },
      { leaf: 'marketing-analytics', stat: '', statLabel: 'Manage' },
      { leaf: 'marketing-market-read', stat: '', statLabel: 'Manage' },
      { leaf: 'marketing-agent', stat: '', statLabel: 'Manage' },
    ],
    viewer,
  )

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
  // A group the viewer's gates emptied renders nothing rather than an empty titled section.
  if (cards.length === 0) return null
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
              <p className="text-body-sm font-semibold text-text">{c.label}</p>
              <p className="mt-0.5 text-meta leading-snug text-muted">{c.desc}</p>
            </div>
            <p className="mt-auto flex items-baseline gap-1.5">
              {c.stat && <span className="text-body-lg font-bold tabular-nums text-text">{c.stat}</span>}
              <span className="text-2xs font-medium uppercase tracking-wide text-muted">{c.statLabel}</span>
            </p>
          </Link>
        ))}
      </div>
    </AdminSection>
  )
}
