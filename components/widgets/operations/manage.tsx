import Link from 'next/link'
import {
  ArrowUpRight, Menu, FileText, CreditCard, Palette, Building2,
  LayoutPanelLeft, Sparkles, ScrollText, LayoutDashboard, type LucideIcon,
} from 'lucide-react'
import { AdminSection } from '@/components/templates'
import { canUseLink, type AdminLink } from '@/app/(main)/admin/sections'
import { studioLeaf } from '@/lib/nav/studio'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getStaffMember } from '@/lib/staff'
import type { CommunityRole, WebRole } from '@/lib/core/roles'
import type { StaffRole } from '@/lib/core/staff-roles'

// Operations layout module (LP7): "Manage" — one card per working sub-page, each a live stat plus a
// link straight to the surface that edits it. Self-fetching RSC; the page owns the gate and every
// linked area keeps its own. Fail-safe: any read error degrades to honest zeros. The grid is a
// container query so it sizes to whatever slot it lands in. Semantic tokens only; no hex, no fixed px.
//
// THE DESTINATIONS ARE DERIVED, NOT TYPED (SCAN-503). Label, description, href, icon and GATE all
// come from the one nav catalog (lib/nav/studio.ts::STUDIO_LEAVES) via `studioLeaf(id)`. This file
// declares only what the catalog cannot know: which leaves belong on this dashboard, and the live
// stat under each. While the cards were hand-declared the copy drifted from the leaf `desc` and the
// cards carried NO gate, so a viewer was offered destinations that bounce on click — and
// `check:menu` is structurally blind to a list rendered by a page
// (docs/MENU-CONTRACT.md §"What is NOT enforced").

/** A destination card: the catalog's link, plus the live stat this dashboard reads for it. */
type ManageCard = AdminLink & { stat: string; statLabel: string }

/** What this dashboard adds to a leaf: which one, and the stat beneath it. */
type CardSpec = { leaf: string; stat: string; statLabel: string }

/** lucide icon NAME → component, for the leaves listed below. The catalog stores names
 *  (framework-free); app/(main)/admin/sections.ts keeps the same map for its own consumers but
 *  does not export the resolver, so the widget resolves the handful of names it renders. */
const ICONS: Record<string, LucideIcon> = {
  Menu, FileText, CreditCard, Palette, Building2, LayoutPanelLeft, Sparkles, ScrollText,
}

interface ViewerRoles {
  role: CommunityRole
  webRole: WebRole
  staffRole: StaffRole | null
}

/** The viewer's three role axes, read the same way the sibling "Related areas" module reads them
 *  (components/widgets/operations/related.tsx). Null on a signed-out or failed read, which hides the
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
  pages: number
  themes: number
  spaces: number
  demoMembers: number
  audit: number
}

const EMPTY: ManageCounts = { pages: 0, themes: 0, spaces: 0, demoMembers: 0, audit: 0 }

async function load(): Promise<ManageCounts> {
  try {
    const admin = createAdminClient()
    const weekAgo = new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const [pagesC, themesC, spacesC, demoMembersC, auditC] = await Promise.all([
      admin.from('pages').select('id', { count: 'exact', head: true }),
      admin.from('themes').select('id', { count: 'exact', head: true }),
      admin.from('spaces').select('id', { count: 'exact', head: true }),
      admin.from('profiles').select('id', { count: 'exact', head: true }).eq('is_demo', true),
      admin.from('admin_audit_log').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
    ])
    return {
      pages: pagesC.count ?? 0,
      themes: themesC.count ?? 0,
      spaces: spacesC.count ?? 0,
      demoMembers: demoMembersC.count ?? 0,
      audit: auditC.count ?? 0,
    }
  } catch {
    return EMPTY
  }
}

export async function OperationsManage() {
  const [c, viewer] = await Promise.all([load(), loadRoles()])
  if (!viewer) return null

  const specs: CardSpec[] = [
    { leaf: 'menu', stat: '', statLabel: 'Manage' },
    { leaf: 'pages', stat: `${c.pages}`, statLabel: 'pages' },
    { leaf: 'payments', stat: '', statLabel: 'Manage' },
    { leaf: 'appearance', stat: `${c.themes}`, statLabel: 'themes' },
    { leaf: 'spaces', stat: `${c.spaces}`, statLabel: 'spaces' },
    { leaf: 'page-layout', stat: '', statLabel: 'Manage' },
    { leaf: 'demo', stat: `${c.demoMembers}`, statLabel: 'demo members' },
    { leaf: 'audit', stat: `${c.audit}`, statLabel: 'entries · 7d' },
  ]

  const cards = cardsFor(specs, viewer)
  if (cards.length === 0) return null

  return (
    <AdminSection title="Manage" description="Every working surface in Operations. Open one to edit it.">
      <div className="grid gap-3 @2xl:grid-cols-2 @4xl:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-border-strong"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
                <card.Icon className="h-4 w-4" aria-hidden />
              </span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-body-sm font-semibold text-text">{card.label}</p>
              <p className="mt-0.5 text-meta leading-snug text-muted">{card.desc}</p>
            </div>
            <p className="mt-auto flex items-baseline gap-1.5">
              {card.stat && <span className="text-body-lg font-bold tabular-nums text-text">{card.stat}</span>}
              <span className="text-2xs font-medium uppercase tracking-wide text-muted">{card.statLabel}</span>
            </p>
          </Link>
        ))}
      </div>
    </AdminSection>
  )
}
