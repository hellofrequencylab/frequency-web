import { Suspense } from 'react'
import Link from 'next/link'
import {
  SlidersHorizontal, ArrowUpRight, Bot, Server, Menu, FileText, CreditCard,
  Palette, Building2, LayoutPanelLeft, Sparkles, ScrollText,
  type LucideIcon,
} from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { RelatedAreas } from '@/components/admin/related-areas'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { DashArea, TileGrid, Tile, GraphTile, MiniStat, MiniGrid } from '@/components/admin/dash'
import { WeekBars, weeklyBuckets } from '@/components/admin/spark-charts'
import { AttentionList, type AttentionItem } from '@/components/admin/attention-list'
import { FreshnessNote } from '@/components/admin/freshness-note'
import { createAdminClient } from '@/lib/supabase/admin'
import { aiEnabledFlag, demoContentExists } from '@/lib/platform-flags'

// Operations — "the platform machine," a single DASHBOARD (no sub-tabs): the AI &
// assistant KPIs and the platform/system-health stats up top, then ONE section per
// working sub-page (Menu, Pages, Payments, Theme Studio, Spaces, Page layout, Demo
// Studio, and the audit trail), each with a live stat and a link straight to the
// surface that edits it. Gate: janitor / platform staff (everything here is sensitive);
// each linked area keeps its own gate. Each slow read streams behind its own Suspense
// so the shell never blocks (PAGE-FRAMEWORK §5).
export const dynamic = 'force-dynamic'

const DAY = 24 * 60 * 60 * 1000
const WEEK = 7 * DAY
const VOLUME_WEEKS = 8

export default async function OperationsDashboard() {
  const { role, webRole, staffRole } = await requireAdmin('janitor', { staff: 'platform' })

  return (
    <AdminTemplate
      title="Operations"
      eyebrow="Domain"
      icon={SlidersHorizontal}
      width="wide"
      description="The platform machine. AI, content infrastructure, commerce, and the system trail at a glance, then every working surface, each a click from editing."
    >
      <Suspense fallback={<DashSkeleton title="AI & assistant" />}>
        <AiArea />
      </Suspense>

      <Suspense fallback={<DashSkeleton title="Platform" />}>
        <PlatformArea />
      </Suspense>

      <Suspense fallback={<DashSkeleton title="Manage" />}>
        <ManageSections />
      </Suspense>

      <RelatedAreas current="operations" role={role} webRole={webRole} staffRole={staffRole} />
    </AdminTemplate>
  )
}

// ── AI & assistant — the master switch, pending agent actions, Vera throughput. ──
async function AiArea() {
  const admin = createAdminClient()
  const nowMs = new Date().getTime()
  const weekAgo = new Date(nowMs - WEEK).toISOString()
  const volStart = new Date(nowMs - VOLUME_WEEKS * WEEK).toISOString()

  const [aiOn, pendingActions, queries7d, answered7d, deflected7d, qSeriesRes] = await Promise.all([
    aiEnabledFlag(),
    admin.from('agent_actions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('ai_help_queries').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
    admin.from('ai_help_queries').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo).eq('answered', true),
    admin.from('ai_help_queries').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo).eq('deflected', true),
    admin.from('ai_help_queries').select('created_at').gte('created_at', volStart),
  ])

  const actionsPending = pendingActions.count ?? 0
  const total = queries7d.count ?? 0
  const answered = answered7d.count ?? 0
  const gaps = deflected7d.count ?? 0
  const answeredRate = total > 0 ? Math.round((answered / total) * 100) : null
  const deflectedRate = total > 0 ? Math.round((gaps / total) * 100) : null
  const qSeries = weeklyBuckets(
    ((qSeriesRes.data ?? []) as { created_at: string }[]).map((r) => new Date(r.created_at)),
    VOLUME_WEEKS,
  )

  // The domain attention spine — only actionable items, ranked by what's waiting.
  const attention: AttentionItem[] = []
  if (actionsPending > 0) {
    attention.push({
      id: 'studio-prompts',
      severity: actionsPending > 5 ? 'risk' : 'watch',
      title: `${actionsPending} AI ${actionsPending === 1 ? 'action' : 'actions'} awaiting review`,
      finding: 'The operator has proposals queued for your approval.',
      action: { label: 'Review', href: '/admin/vera-ai?tab=studio' },
    })
  }
  if (gaps > 0) {
    attention.push({
      id: 'help-gaps',
      severity: gaps > 10 ? 'risk' : 'watch',
      title: `${gaps} help ${gaps === 1 ? 'gap' : 'gaps'} this week`,
      finding: "Questions Vera couldn't confidently answer. The to-write list.",
      action: { label: 'See gaps', href: '/admin/vera-ai?tab=help-gaps' },
    })
  }

  return (
    <DashArea
      icon={Bot}
      label="AI & assistant"
      blurb="The AI master switch, the agent actions awaiting review, and the help gaps Vera couldn't answer. Assistant figures cover the last 7 days of Vera questions."
      href="/admin/vera-ai?tab=ai"
      hrefLabel="Open AI controls"
      footnote={<FreshnessNote at={new Date()} label="Computed" />}
    >
      <TileGrid>
        <Tile label="Assistant">
          <MiniGrid>
            <MiniStat value={aiOn ? 'On' : 'Off'} label="AI platform" tone={aiOn ? 'good' : 'bad'} />
            <MiniStat value={total.toLocaleString()} label="Questions · 7d" />
            <MiniStat value={answeredRate === null ? '—' : `${answeredRate}%`} label="Answered" />
            <MiniStat
              value={deflectedRate === null ? '—' : `${deflectedRate}%`}
              label="Deflected"
              tone={deflectedRate !== null && deflectedRate > 0 ? 'bad' : 'neutral'}
            />
            <MiniStat value={gaps.toLocaleString()} label="Help gaps · 7d" tone={gaps > 0 ? 'bad' : 'neutral'} />
            <MiniStat value={actionsPending.toLocaleString()} label="Studio prompts" tone={actionsPending > 0 ? 'bad' : 'neutral'} />
          </MiniGrid>
        </Tile>
        <GraphTile label="Vera questions / wk" value={total.toLocaleString()} caption={`${VOLUME_WEEKS} weeks · current highlighted`}>
          <WeekBars values={qSeries} height={64} />
        </GraphTile>
        {attention.length > 0 && (
          <Tile label="Needs attention">
            <AttentionList items={attention} />
          </Tile>
        )}
      </TileGrid>
    </DashArea>
  )
}

// ── Platform — content infrastructure, commerce, the trail, and demo content. ────
async function PlatformArea() {
  const admin = createAdminClient()
  const weekAgo = new Date(new Date().getTime() - WEEK).toISOString()

  const [pages, auditEntries, hasDemo, demoRows] = await Promise.all([
    admin.from('pages').select('id', { count: 'exact', head: true }),
    admin.from('admin_audit_log').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
    demoContentExists(),
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('is_demo', true),
  ])

  return (
    <DashArea
      icon={Server}
      label="Platform"
      blurb="The platform keys — published pages, payouts, the audit trail, and whether demo content is present. The trail is the security record of sensitive actions in the last 7 days."
      href="/admin/audit"
      hrefLabel="Open audit log"
    >
      <TileGrid>
        <Tile label="Infrastructure">
          <MiniGrid>
            <MiniStat value={(pages.count ?? 0).toLocaleString()} label="Pages" />
            <MiniStat value={(auditEntries.count ?? 0).toLocaleString()} label="Audit · 7d" />
            <MiniStat value={hasDemo ? 'Present' : 'None'} label="Demo content" />
            <MiniStat value={(demoRows.count ?? 0).toLocaleString()} label="Demo members" />
          </MiniGrid>
        </Tile>
      </TileGrid>
    </DashArea>
  )
}

// ── Manage — one section per working sub-page, each a stat + a link to edit it. ──
interface ManageCard {
  label: string
  desc: string
  stat: string
  statLabel: string
  href: string
  Icon: LucideIcon
}

async function ManageSections() {
  const admin = createAdminClient()
  const weekAgo = new Date(new Date().getTime() - WEEK).toISOString()
  const [pagesC, themesC, spacesC, demoMembersC, auditC] = await Promise.all([
    admin.from('pages').select('id', { count: 'exact', head: true }),
    admin.from('themes').select('id', { count: 'exact', head: true }),
    admin.from('spaces').select('id', { count: 'exact', head: true }),
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('is_demo', true),
    admin.from('admin_audit_log').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
  ])

  const cards: ManageCard[] = [
    { label: 'Menu manager', desc: 'Order and hide the one shared nav menu; set who reaches each item.', stat: '', statLabel: 'Manage', href: '/admin/menu', Icon: Menu },
    { label: 'Pages', desc: 'The page library: open any page to edit it in place. Marketing + beta induction too.', stat: `${pagesC.count ?? 0}`, statLabel: 'pages', href: '/pages', Icon: FileText },
    { label: 'Payments', desc: 'Turn host payouts (tips, tickets, sales) on or off.', stat: '', statLabel: 'Manage', href: '/admin/payments', Icon: CreditCard },
    { label: 'Theme Studio', desc: 'Brand themes, palettes, and seasonal looks. Edit and assign without code.', stat: `${themesC.count ?? 0}`, statLabel: 'themes', href: '/admin/appearance', Icon: Palette },
    { label: 'Spaces', desc: 'White-label tenants: each Space its theme, brand name, accent, and logo.', stat: `${spacesC.count ?? 0}`, statLabel: 'spaces', href: '/admin/spaces', Icon: Building2 },
    { label: 'Page layout', desc: "Frame each route's right rail: Global, Scoped, or full-width Focus.", stat: '', statLabel: 'Manage', href: '/admin/page-layout', Icon: LayoutPanelLeft },
    { label: 'Demo Studio', desc: 'Generate, manage, and purge seeded demo content.', stat: `${demoMembersC.count ?? 0}`, statLabel: 'demo members', href: '/admin/demo', Icon: Sparkles },
    { label: 'Audit log', desc: 'Sensitive admin actions. The security trail.', stat: `${auditC.count ?? 0}`, statLabel: 'entries · 7d', href: '/admin/audit', Icon: ScrollText },
  ]

  return (
    <AdminSection title="Manage" description="Every working surface in Operations. Open one to edit it.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

// On-canvas area skeleton matching the DashArea grammar — a canvas title + line, then a
// row of white tile placeholders. Mirrors the home + Programs dashboard fallbacks.
function DashSkeleton({ title }: { title: string }) {
  return (
    <section className="border-t border-border/70 pt-8 first:border-t-0 first:pt-0 sm:pt-9">
      <h2 className="text-xl font-bold tracking-tight text-text">{title}</h2>
      <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-surface-elevated" />
      <div className="mt-5 grid grid-cols-2 gap-3.5 lg:grid-cols-3">
        <div className="h-32 animate-pulse rounded-2xl bg-surface-elevated/70" />
        <div className="h-32 animate-pulse rounded-2xl bg-surface-elevated/70" />
        <div className="h-32 animate-pulse rounded-2xl bg-surface-elevated/70" />
      </div>
    </section>
  )
}
