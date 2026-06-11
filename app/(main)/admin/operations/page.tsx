import { Fragment, Suspense } from 'react'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { ArrowUpRight, SlidersHorizontal, Bot, Server } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { dashCookie, sanitizeDashOrder } from '../dash-sections'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { DashArea, TileGrid, Tile, GraphTile, MiniStat, MiniGrid } from '@/components/admin/dash'
import { WeekBars, weeklyBuckets } from '@/components/admin/spark-charts'
import { AttentionList, type AttentionItem } from '@/components/admin/attention-list'
import { FreshnessNote } from '@/components/admin/freshness-note'
import { groupLinks } from '../sections'
import type { AdminLink } from '../sections'
import { createAdminClient } from '@/lib/supabase/admin'
import { aiEnabledFlag, demoContentExists } from '@/lib/platform-flags'

// Operations — "the platform machine." The DOMAIN DASHBOARD (ADR-233 §3.2): the same
// tiled grammar as the exec home, scoped to the system layer — the AI/assistant
// controls, content infrastructure (pages), commerce switches, the demo layer, and the
// security trail. KPI MiniStat clusters + graphs + a domain attention strip + area-card
// entry tiles into the domain's own surfaces. Headers + instructional copy print on the
// canvas; all data lives in white tiles. Gate: janitor / platform staff (everything here
// is sensitive); each linked area keeps its own gate. Each slow read sits behind its own
// Suspense so the shell never blocks (PAGE-FRAMEWORK §5).

const DAY = 24 * 60 * 60 * 1000
const WEEK = 7 * DAY
const VOLUME_WEEKS = 8

export default async function OperationsDashboard() {
  const { role, webRole, staffRole } = await requireAdmin('janitor', { staff: 'platform' })
  const links = groupLinks('operations', role, webRole, staffRole)
  const order = sanitizeDashOrder('operations', (await cookies()).get(dashCookie('operations'))?.value)

  const sections: Record<string, React.ReactNode> = {
    ai: (
      <Suspense fallback={<DashSkeleton title="AI & assistant" />}>
        <AiArea />
      </Suspense>
    ),
    platform: (
      <Suspense fallback={<DashSkeleton title="Platform" />}>
        <PlatformArea />
      </Suspense>
    ),
    work: (
      <AdminSection title="Work in Operations" description="Every surface in this domain you can manage.">
        <AreaTiles links={links} />
      </AdminSection>
    ),
  }

  return (
    <AdminTemplate
      title="Operations"
      eyebrow="Domain"
      icon={SlidersHorizontal}
      width="wide"
      description="The platform machine. AI, content infrastructure, commerce, and the system trail. Start with whatever needs your attention, then dig into a surface."
    >
      {order.map((id) => (
        <Fragment key={id}>{sections[id]}</Fragment>
      ))}
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
      action: { label: 'Review', href: '/admin/studio' },
    })
  }
  if (gaps > 0) {
    attention.push({
      id: 'help-gaps',
      severity: gaps > 10 ? 'risk' : 'watch',
      title: `${gaps} help ${gaps === 1 ? 'gap' : 'gaps'} this week`,
      finding: "Questions Vera couldn't confidently answer. The to-write list.",
      action: { label: 'See gaps', href: '/admin/help-gaps' },
    })
  }

  return (
    <DashArea
      icon={Bot}
      label="AI & assistant"
      blurb="The AI master switch, the agent actions awaiting review, and the help gaps Vera couldn't answer. Assistant figures cover the last 7 days of Vera questions."
      href="/admin/ai"
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

// Area-card entry tiles into the domain's surfaces — the soft-surface launchpad style,
// scoped to what the viewer can reach (role filtering happens upstream in groupLinks).
function AreaTiles({ links }: { links: readonly AdminLink[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="group flex items-start gap-3 rounded-2xl bg-surface-elevated/60 p-4 transition-colors hover:bg-surface-elevated motion-reduce:transition-none"
        >
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-primary-strong">
            <l.Icon className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1 text-sm font-semibold text-text">
              {l.label}
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
            </span>
            <span className="mt-0.5 block text-xs text-muted">{l.desc}</span>
          </span>
        </Link>
      ))}
    </div>
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
