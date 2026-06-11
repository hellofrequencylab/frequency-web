import { Suspense } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Gamepad2 } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { DashArea, TileGrid, Tile, GraphTile, MiniStat, MiniGrid } from '@/components/admin/dash'
import { TrendArea, WeekBars, RingGauge, weeklyBuckets, cumulative } from '@/components/admin/spark-charts'
import { AttentionList, type AttentionItem } from '@/components/admin/attention-list'
import { FreshnessNote } from '@/components/admin/freshness-note'
import { groupLinks } from '../sections'
import type { AdminLink } from '../sections'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentSeason } from '@/lib/seasons'
import { pendingReviewCount } from '@/lib/library'
import { getOutcomeReport } from '@/lib/analytics/outcomes'
import { getPracticeMetrics } from '@/lib/analytics/practice'

// Programs — "the game." The DOMAIN DASHBOARD (ADR-233 §3.2): the same tiled grammar
// as the exec home, scoped to content, seasons, rewards, crews, and leader training.
// KPI MiniStat clusters + graphs + a domain attention strip + area-card entry tiles
// into the domain's own surfaces. Headers + instructional copy print on the canvas;
// all data lives in white tiles. Gate: host+ with the community staff domain
// (curation); the rewards/tips areas keep their own stricter gates at their pages.
// Each slow read sits behind its own Suspense so the shell never blocks
// (PAGE-FRAMEWORK §5).

const WEEK = 7 * 24 * 60 * 60 * 1000
const GROWTH_WEEKS = 12
const VOLUME_WEEKS = 8

export default async function ProgramsDashboard() {
  const { role, webRole, staffRole } = await requireAdmin('host', { staff: 'community' })
  const links = groupLinks('programs', role, webRole, staffRole)

  return (
    <AdminTemplate
      title="Programs"
      eyebrow="Domain"
      icon={Gamepad2}
      width="wide"
      description="The game. Content, seasons, rewards, and the crews that run them. Start with whatever needs your attention, then dig into a surface."
    >
      <Suspense fallback={<DashSkeleton title="The catalog" />}>
        <CatalogArea />
      </Suspense>

      <Suspense fallback={<DashSkeleton title="Season & outcomes" />}>
        <SeasonArea />
      </Suspense>

      <AdminSection title="Work in Programs" description="Every surface in this domain you can manage.">
        <AreaTiles links={links} />
      </AdminSection>
    </AdminTemplate>
  )
}

// ── The catalog: content volume, the library trend, and practice throughput. ───
async function CatalogArea() {
  const admin = createAdminClient()
  const since = new Date(Date.now() - GROWTH_WEEKS * WEEK).toISOString()
  const volumeStart = new Date(Date.now() - VOLUME_WEEKS * WEEK).toISOString()
  const [
    practicesC,
    journeysC,
    officialC,
    challengesC,
    storeC,
    adoptionsC,
    featuredC,
    practice,
    newPractices,
    practiceVolume,
    pendingReviews,
  ] = await Promise.all([
    admin.from('practices').select('id', { count: 'exact', head: true }),
    admin.from('journey_plans').select('id', { count: 'exact', head: true }).eq('visibility', 'public'),
    admin.from('journey_plans').select('id', { count: 'exact', head: true }).eq('official', true),
    admin.from('season_challenges').select('id', { count: 'exact', head: true }),
    admin.from('store_items').select('id', { count: 'exact', head: true }),
    admin.from('journey_plan_adoptions').select('id', { count: 'exact', head: true }).eq('active', true),
    admin.from('practices').select('id', { count: 'exact', head: true }).not('featured_at', 'is', null),
    getPracticeMetrics(),
    admin.from('practices').select('created_at').gte('created_at', since),
    admin
      .from('engagement_events')
      .select('created_at')
      .eq('event_type', 'practice.verified')
      .gte('created_at', volumeStart),
    pendingReviewCount(),
  ])

  const totalPractices = practicesC.count ?? 0
  const createdWeekly = weeklyBuckets(
    ((newPractices.data ?? []) as { created_at: string }[]).map((r) => new Date(r.created_at)),
    GROWTH_WEEKS,
  )
  const inWindow = createdWeekly.reduce((a, b) => a + b, 0)
  const libraryGrowth = cumulative(totalPractices - inWindow, createdWeekly)
  const practiceSeries = weeklyBuckets(
    ((practiceVolume.data ?? []) as { created_at: string }[]).map((r) => new Date(r.created_at)),
    VOLUME_WEEKS,
  )

  // The domain attention spine — only actionable items, ranked by what's waiting.
  const attention: AttentionItem[] = []
  if (pendingReviews > 0) {
    attention.push({
      id: 'reviews',
      severity: pendingReviews > 10 ? 'risk' : 'watch',
      title: `${pendingReviews} ${pendingReviews === 1 ? 'submission' : 'submissions'} awaiting review`,
      finding: 'Member Journeys and Practices waiting on a curation call.',
      action: { label: 'Review', href: '/admin/content' },
    })
  }

  return (
    <DashArea
      icon={Gamepad2}
      label="The catalog"
      blurb="Content, seasons, and the store that drive the game. Catalog counts read live from the content suite; practice volume is verified logs from the engagement ledger."
      href="/admin/content"
      hrefLabel="Open Content"
    >
      <TileGrid>
        <Tile label="In the library">
          <MiniGrid>
            <MiniStat value={totalPractices.toLocaleString()} label="Practices" />
            <MiniStat value={(journeysC.count ?? 0).toLocaleString()} label="Journeys" />
            <MiniStat value={(officialC.count ?? 0).toLocaleString()} label="Official" />
            <MiniStat value={(challengesC.count ?? 0).toLocaleString()} label="Challenges" />
            <MiniStat value={(storeC.count ?? 0).toLocaleString()} label="Store items" />
            <MiniStat value={(featuredC.count ?? 0).toLocaleString()} label="Featured" />
          </MiniGrid>
        </Tile>
        <GraphTile
          label="Practice library"
          value={totalPractices.toLocaleString()}
          caption={`${GROWTH_WEEKS} weeks · cumulative`}
        >
          <TrendArea points={libraryGrowth} height={64} />
        </GraphTile>
        <GraphTile
          label="Verified practices / wk"
          value={practice.verifiedThisWeek.toLocaleString()}
          caption={`${VOLUME_WEEKS} weeks · current highlighted`}
        >
          <WeekBars values={practiceSeries} height={64} />
        </GraphTile>
        {attention.length > 0 && (
          <Tile label="Needs attention" span={3}>
            <AttentionList items={attention} />
          </Tile>
        )}
        <Tile label="Adoption" span={3} caption="Active Journey adoptions across the membership.">
          <MiniGrid>
            <MiniStat value={(adoptionsC.count ?? 0).toLocaleString()} label="Active adoptions" />
            <MiniStat value={(featuredC.count ?? 0).toLocaleString()} label="Featured practices" />
          </MiniGrid>
        </Tile>
      </TileGrid>
    </DashArea>
  )
}

// ── Season & outcomes: the live season, activation, and challenge completion. ──
async function SeasonArea() {
  const [season, report, practice] = await Promise.all([
    getCurrentSeason(),
    getOutcomeReport(),
    getPracticeMetrics(),
  ])
  const rated = report.challenges.filter((c) => c.rate !== null)
  const avgCompletion =
    rated.length > 0 ? Math.round(rated.reduce((s, c) => s + (c.rate ?? 0), 0) / rated.length) : null
  const activationPct = Math.round(practice.activationRate * 100)

  return (
    <DashArea
      icon={Gamepad2}
      label="Season & outcomes"
      blurb="The live season and how members are progressing through it. Activation is the share of new members who verified a first practice; completion averages the active challenges."
      href="/admin/gamification"
      hrefLabel="Open Gamification"
      footnote={<FreshnessNote at={new Date()} label="Computed" />}
    >
      <TileGrid>
        <Tile label="Active season">
          <p className="text-xl font-bold leading-tight text-text">
            {season ? season.name : 'None'}
          </p>
          <p className="mt-1.5 text-xs font-medium text-muted">
            {season ? `Season ${season.season_number}` : 'No season running'}
          </p>
        </Tile>
        <div className="col-span-1 flex items-center rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <RingGauge
            pct={practice.activationRate}
            label="Activation"
            sub={`${practice.activated} of ${practice.newMembers} new activated`}
          />
        </div>
        <Tile label="This season">
          <MiniGrid>
            <MiniStat value={`${activationPct}%`} label="Activation" />
            <MiniStat
              value={avgCompletion === null ? '–' : `${avgCompletion}%`}
              label="Challenge completion"
            />
            <MiniStat value={rated.length.toLocaleString()} label="Active challenges" />
            <MiniStat value={practice.wam.toLocaleString()} label="Active · 7d" />
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

// On-canvas area skeleton matching the DashArea grammar — a canvas title + line, then
// a row of white tile placeholders. Mirrors the home dashboard's fallback.
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
