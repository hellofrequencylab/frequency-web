import Link from 'next/link'
import {
  ArrowUpRight, Menu, FileText, CreditCard, Palette, Building2,
  LayoutPanelLeft, Sparkles, ScrollText, type LucideIcon,
} from 'lucide-react'
import { AdminSection } from '@/components/templates'
import { createAdminClient } from '@/lib/supabase/admin'

// Operations layout module (LP7): "Manage" — one card per working sub-page, each a live stat plus a
// link straight to the surface that edits it. Self-fetching RSC; the page owns the gate and every
// linked area keeps its own. Fail-safe: any read error degrades to honest zeros. The grid is a
// container query so it sizes to whatever slot it lands in. Semantic tokens only; no hex, no fixed px.

interface ManageCard {
  label: string
  desc: string
  stat: string
  statLabel: string
  href: string
  Icon: LucideIcon
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
  const c = await load()

  const cards: ManageCard[] = [
    { label: 'Menu manager', desc: 'Order and hide the one shared nav menu; set who reaches each item.', stat: '', statLabel: 'Manage', href: '/admin/menu', Icon: Menu },
    { label: 'Pages', desc: 'The page library: open any page to edit it in place. Marketing + beta induction too.', stat: `${c.pages}`, statLabel: 'pages', href: '/pages', Icon: FileText },
    { label: 'Payments', desc: 'Turn host payouts (tips, tickets, sales) on or off.', stat: '', statLabel: 'Manage', href: '/admin/payments', Icon: CreditCard },
    { label: 'Theme Studio', desc: 'Brand themes, palettes, and seasonal looks. Edit and assign without code.', stat: `${c.themes}`, statLabel: 'themes', href: '/admin/appearance', Icon: Palette },
    { label: 'Spaces', desc: 'White-label tenants: each Space its theme, brand name, accent, and logo.', stat: `${c.spaces}`, statLabel: 'spaces', href: '/admin/spaces', Icon: Building2 },
    { label: 'Page layout', desc: "Frame each route's right rail: Global, Scoped, or full-width Focus.", stat: '', statLabel: 'Manage', href: '/admin/page-layout', Icon: LayoutPanelLeft },
    { label: 'Demo Studio', desc: 'Generate, manage, and purge seeded demo content.', stat: `${c.demoMembers}`, statLabel: 'demo members', href: '/admin/demo', Icon: Sparkles },
    { label: 'Audit log', desc: 'Sensitive admin actions. The security trail.', stat: `${c.audit}`, statLabel: 'entries · 7d', href: '/admin/audit', Icon: ScrollText },
  ]

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
              <p className="text-sm font-semibold text-text">{card.label}</p>
              <p className="mt-0.5 text-xs leading-snug text-muted">{card.desc}</p>
            </div>
            <p className="mt-auto flex items-baseline gap-1.5">
              {card.stat && <span className="text-lg font-bold tabular-nums text-text">{card.stat}</span>}
              <span className="text-2xs font-medium uppercase tracking-wide text-subtle">{card.statLabel}</span>
            </p>
          </Link>
        ))}
      </div>
    </AdminSection>
  )
}
