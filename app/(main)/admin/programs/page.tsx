import { Suspense } from 'react'
import Link from 'next/link'
import {
  Gamepad2, ArrowUpRight, CalendarDays, BookOpen, Sparkles, Target,
  GraduationCap, Lightbulb, Trophy, ShoppingBag, ClipboardList,
  type LucideIcon,
} from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { DashArea, TileGrid, Tile, GraphTile, MiniStat, MiniGrid } from '@/components/admin/dash'
import { TrendArea, WeekBars, RingGauge, weeklyBuckets, cumulative } from '@/components/admin/spark-charts'
import { AttentionList, type AttentionItem } from '@/components/admin/attention-list'
import { FreshnessNote } from '@/components/admin/freshness-note'
import { RelatedAreas } from '@/components/admin/related-areas'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentSeason } from '@/lib/seasons'
import { pendingReviewCount } from '@/lib/library'
import { getOutcomeReport } from '@/lib/analytics/outcomes'
import { getPracticeMetrics } from '@/lib/analytics/practice'

// Programs — the game's operator home, a single DASHBOARD (no sub-tabs): the program
// stats and the season up top, then ONE section per working sub-page (Seasons, Journeys,
// Practices, Challenges, Role training, Vera's tips, and the rewards economy), each with
// a live stat and a link straight to the page that edits it. Each slow read streams
// behind its own Suspense so the shell never blocks (PAGE-FRAMEWORK §5).
export const dynamic = 'force-dynamic'

const WEEK = 7 * 24 * 60 * 60 * 1000
const GROWTH_WEEKS = 12
const VOLUME_WEEKS = 8

export default async function ProgramsDashboard() {
  const { role, webRole, staffRole } = await requireAdmin('host', { staff: 'community' })

  return (
    <AdminTemplate
      title="Programs"
      eyebrow="Domain"
      icon={Gamepad2}
      width="wide"
      description="The game in one place: the stats and the season at a glance, then every working surface, each a click from editing."
    >
      <Suspense fallback={<DashSkeleton title="Program Stats" />}>
        <ProgramStats />
      </Suspense>

      <Suspense fallback={<DashSkeleton title="The Quest" />}>
        <SeasonStats />
      </Suspense>

      <Suspense fallback={<DashSkeleton title="Manage" />}>
        <ManageSections />
      </Suspense>

      <RelatedAreas current="programs" role={role} webRole={webRole} staffRole={staffRole} />
    </AdminTemplate>
  )
}

// ── Program Stats — content volume, the library trend, and practice throughput. ──
async function ProgramStats() {
  const admin = createAdminClient()
  const nowMs = new Date().getTime()
  const since = new Date(nowMs - GROWTH_WEEKS * WEEK).toISOString()
  const volumeStart = new Date(nowMs - VOLUME_WEEKS * WEEK).toISOString()
  const [
    practicesC, journeysC, officialC, challengesC, storeC, adoptionsC, featuredC,
    practice, newPractices, practiceVolume, pendingReviews,
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
    admin.from('engagement_events').select('created_at').eq('event_type', 'practice.verified').gte('created_at', volumeStart),
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

  const attention: AttentionItem[] = []
  if (pendingReviews > 0) {
    attention.push({
      id: 'reviews',
      severity: pendingReviews > 10 ? 'risk' : 'watch',
      title: `${pendingReviews} ${pendingReviews === 1 ? 'submission' : 'submissions'} awaiting review`,
      finding: 'Member Journeys and Practices waiting on a curation call.',
      action: { label: 'Review', href: '/admin/content/journeys' },
    })
  }

  return (
    <DashArea
      icon={Gamepad2}
      label="Program Stats"
      blurb="Content, seasons, and the store that drive the game. Counts read live; practice volume is verified logs from the engagement ledger."
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
        <GraphTile label="Practice library" value={totalPractices.toLocaleString()} caption={`${GROWTH_WEEKS} weeks · cumulative`}>
          <TrendArea points={libraryGrowth} height={64} />
        </GraphTile>
        <GraphTile label="Verified practices / wk" value={practice.verifiedThisWeek.toLocaleString()} caption={`${VOLUME_WEEKS} weeks · current highlighted`}>
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

// ── The Quest — the live season, activation, and challenge completion. ──────────
async function SeasonStats() {
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
      label="The Quest"
      blurb="The live season and how members are progressing through it. Activation is the share of new members who verified a first practice; completion averages the active challenges."
      footnote={<FreshnessNote at={new Date()} label="Computed" />}
    >
      <TileGrid>
        <Tile label="Active season">
          <p className="text-xl font-bold leading-tight text-text">{season ? season.name : 'None'}</p>
          <p className="mt-1.5 text-xs font-medium text-muted">
            {season ? `Season ${season.season_number}` : 'No season running'}
          </p>
        </Tile>
        <div className="col-span-1 flex items-center rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <RingGauge pct={practice.activationRate} label="Activation" sub={`${practice.activated} of ${practice.newMembers} new activated`} />
        </div>
        <Tile label="This season">
          <MiniGrid>
            <MiniStat value={`${activationPct}%`} label="Activation" />
            <MiniStat value={avgCompletion === null ? '–' : `${avgCompletion}%`} label="Challenge completion" />
            <MiniStat value={rated.length.toLocaleString()} label="Active challenges" />
            <MiniStat value={practice.wam.toLocaleString()} label="Active · 7d" />
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
  const [seasonsC, officialC, journeysC, practicesC, challengesC, storeC, tasksC, season] = await Promise.all([
    admin.from('seasons').select('id', { count: 'exact', head: true }),
    admin.from('journey_plans').select('id', { count: 'exact', head: true }).eq('official', true),
    admin.from('journey_plans').select('id', { count: 'exact', head: true }).eq('visibility', 'public'),
    admin.from('practices').select('id', { count: 'exact', head: true }).eq('is_public', true),
    admin.from('season_challenges').select('id', { count: 'exact', head: true }),
    admin.from('store_items').select('id', { count: 'exact', head: true }),
    admin.from('crew_tasks').select('id', { count: 'exact', head: true }),
    getCurrentSeason(),
  ])

  const cards: ManageCard[] = [
    { label: 'Seasons', desc: 'Identity, theme, and lifecycle. Compose the next one.', stat: `${seasonsC.count ?? 0}`, statLabel: season ? `live: ${season.name}` : 'seasons', href: '/admin/content/seasons', Icon: CalendarDays },
    { label: 'Journeys', desc: 'Review queue, official marks, and what is performing.', stat: `${officialC.count ?? 0}`, statLabel: `official · ${journeysC.count ?? 0} public`, href: '/admin/content/journeys', Icon: BookOpen },
    { label: 'Practices', desc: 'Library curation: visibility, weight class, and features.', stat: `${practicesC.count ?? 0}`, statLabel: 'public practices', href: '/admin/content/practices', Icon: Sparkles },
    { label: 'Challenges', desc: 'Define challenges and watch completion this season.', stat: `${challengesC.count ?? 0}`, statLabel: 'challenges', href: '/admin/content/challenges', Icon: Target },
    { label: 'Role training', desc: 'The advancement curriculum each promotion teaches.', stat: '', statLabel: 'Manage', href: '/admin/content/training', Icon: GraduationCap },
    { label: "Vera's tips", desc: 'Draft tips and prompts to content creators. Review and send.', stat: '', statLabel: 'Manage', href: '/admin/content/tips', Icon: Lightbulb },
    { label: 'Gamification', desc: 'Season ranks, achievements, and reward config.', stat: '', statLabel: 'Manage', href: '/admin/gamification', Icon: Trophy },
    { label: 'Store', desc: 'Manage Vault Store items and the catalog.', stat: `${storeC.count ?? 0}`, statLabel: 'items', href: '/admin/store', Icon: ShoppingBag },
    { label: 'Crew tasks', desc: 'Define and verify member tasks.', stat: `${tasksC.count ?? 0}`, statLabel: 'tasks', href: '/admin/crew-tasks', Icon: ClipboardList },
  ]

  return (
    <AdminSection title="Manage" description="Every working surface in Programs. Open one to edit it.">
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

// On-canvas area skeleton matching the DashArea grammar.
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
