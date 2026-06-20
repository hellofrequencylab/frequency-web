import { Suspense } from 'react'
import Link from 'next/link'
import {
  TrendingUp, ArrowUpRight, QrCode, Share2, GraduationCap, ToggleRight,
  Contact, PieChart, Megaphone, Activity, SlidersHorizontal, Layers,
  Rocket, Telescope, Bot,
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
import { getPracticeMetrics } from '@/lib/analytics/practice'
import { getEngagementDashboard } from '@/lib/analytics/dashboard'
import { getDeals, computeMetrics, countOpenTasks, formatMoney } from '@/lib/crm/pipeline'
import { getDensitySignal } from '@/lib/analytics/density'

// Growth — the growth engine's operator home, a single DASHBOARD (no sub-tabs). The
// overview KPIs up top (the funnel + activation, the deal pipeline, and expansion
// readiness), then ONE card per working sub-page across Acquisition, CRM, and Marketing,
// each with a live stat and a link straight to the surface that edits it. Each slow read
// streams behind its own Suspense so the shell never blocks (PAGE-FRAMEWORK §5).
//
// Gate: a staff web_role OR a marketing team capability at READ — the loosest union so no
// operator loses access. Each tool sub-route (/admin/crm/*, /admin/marketing/*) re-gates.
export const dynamic = 'force-dynamic'

const WEEK = 7 * 24 * 60 * 60 * 1000
const GROWTH_WEEKS = 12

export default async function GrowthDashboard() {
  const { role, webRole, staffRole } = await requireAdmin('admin', { staff: 'marketing', staffLevel: 'read' })

  return (
    <AdminTemplate
      title="Growth"
      eyebrow="Domain"
      icon={TrendingUp}
      width="wide"
      description="The growth engine in one place: the funnel and activation, the deal pipeline, and expansion at a glance, then every working surface, each a click from editing."
    >
      <Suspense fallback={<DashSkeleton title="Funnel & activation" />}>
        <FunnelArea />
      </Suspense>

      <Suspense fallback={<DashSkeleton title="Pipeline" />}>
        <PipelineArea />
      </Suspense>

      <Suspense fallback={<DashSkeleton title="Expansion" />}>
        <ExpansionArea />
      </Suspense>

      <Suspense fallback={<DashSkeleton title="Manage" />}>
        <ManageSections />
      </Suspense>

      <RelatedAreas current="growth" role={role} webRole={webRole} staffRole={staffRole} />
    </AdminTemplate>
  )
}

// ── Funnel & activation — new joins trend + the activation funnel. ─────────────
async function FunnelArea() {
  const admin = createAdminClient()
  const now = new Date()
  const growthStart = new Date(now.getTime() - GROWTH_WEEKS * WEEK).toISOString()

  const [joinsRes, totalProfilesRes, practice, dash, campaignsCount, segmentsCount, sequencesCount, contactsCount] =
    await Promise.all([
      admin.from('profiles').select('created_at').gte('created_at', growthStart),
      admin.from('profiles').select('id', { count: 'exact', head: true }),
      getPracticeMetrics(),
      getEngagementDashboard(),
      admin.from('campaigns').select('id', { count: 'exact', head: true }),
      admin.from('segments').select('id', { count: 'exact', head: true }),
      admin.from('nurture_sequences').select('id', { count: 'exact', head: true }).eq('enabled', true),
      admin.from('contacts').select('id', { count: 'exact', head: true }),
    ])

  const totalProfiles = totalProfilesRes.count ?? 0
  const joinDates = (joinsRes.data ?? []).map((r) => new Date(r.created_at as string))
  const weeklyJoins = weeklyBuckets(joinDates, GROWTH_WEEKS, now)
  const joinedInWindow = weeklyJoins.reduce((a, b) => a + b, 0)
  const growthSeries = cumulative(totalProfiles - joinedInWindow, weeklyJoins)
  const newMembers30d = weeklyJoins.slice(-4).reduce((a, b) => a + b, 0)
  const activationPct = Math.round(practice.activationRate * 100)

  const steps = dash.activationFunnel
  const top = steps[0]?.actors ?? 0

  return (
    <DashArea
      icon={TrendingUp}
      label="Funnel & activation"
      blurb="New members joining, and how many reach the North-Star moment (a verified practice) within their first week. The funnel shows where it jams."
      href="/admin/insights?tab=engagement"
      hrefLabel="Open Engagement"
      footnote={<FreshnessNote at={new Date()} label="Computed" />}
    >
      <TileGrid>
        <GraphTile
          label="Member growth"
          value={totalProfiles.toLocaleString()}
          caption={`${GROWTH_WEEKS} weeks${newMembers30d > 0 ? ` · +${newMembers30d} this month` : ''}`}
        >
          <TrendArea points={growthSeries} height={64} />
        </GraphTile>
        <div className="col-span-1 flex items-center rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <RingGauge
            pct={practice.activationRate}
            label="Activation · 7d"
            sub={`${practice.activated} of ${practice.newMembers} new activated`}
          />
        </div>
        <Tile label="Campaigns & audiences">
          <MiniGrid>
            <MiniStat value={(campaignsCount.count ?? 0).toLocaleString()} label="Campaigns" />
            <MiniStat value={(segmentsCount.count ?? 0).toLocaleString()} label="Segments" />
            <MiniStat value={(sequencesCount.count ?? 0).toLocaleString()} label="Active sequences" />
            <MiniStat value={(contactsCount.count ?? 0).toLocaleString()} label="Contacts" />
          </MiniGrid>
        </Tile>
        <Tile
          label="Activation funnel"
          span={3}
          caption="Last 30 days · distinct founders reaching each step, as a share of the first."
        >
          {steps.length === 0 ? (
            <p className="text-sm text-muted">No funnel signal yet.</p>
          ) : (
            <div className="space-y-2.5">
              {steps.map((s) => {
                const width = top > 0 ? Math.round((s.actors / top) * 100) : 0
                return (
                  <div key={s.step}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate text-text">{s.step}</span>
                      <span className="shrink-0 tabular-nums text-muted">
                        {s.actors.toLocaleString()}
                        {s.dropPct !== null && s.dropPct > 0 && (
                          <span className="ml-1.5 text-2xs text-danger">−{s.dropPct}%</span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-elevated">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <p className="mt-3 text-xs text-subtle">Activation is {activationPct}% over the last 7 days.</p>
        </Tile>
      </TileGrid>
    </DashArea>
  )
}

// ── Pipeline (CRM) — deals by status, value, follow-ups, new-deal volume. ──────
async function PipelineArea() {
  const [deals, tasksDue] = await Promise.all([getDeals(), countOpenTasks()])
  const metrics = computeMetrics(deals, tasksDue)
  const dealSeries = weeklyBuckets(
    deals.map((d) => new Date(d.created_at)),
    8,
    new Date(),
  )

  // The domain attention spine — only actionable items, ranked by what's waiting.
  const attention: AttentionItem[] = []
  if (metrics.tasksDue > 0) {
    attention.push({
      id: 'followups',
      severity: metrics.tasksDue > 5 ? 'risk' : 'watch',
      title: `${metrics.tasksDue} follow-up${metrics.tasksDue === 1 ? '' : 's'} due`,
      finding: 'Open CRM tasks waiting so deals do not stall.',
      action: { label: 'Open CRM', href: '/admin/crm/contacts' },
    })
  }

  return (
    <DashArea
      icon={TrendingUp}
      label="Pipeline"
      blurb="Open deals, their value, and the follow-ups due so nothing stalls."
      href="/admin/crm/contacts"
      hrefLabel="Open CRM"
    >
      <TileGrid>
        <Tile label="Pipeline">
          <MiniGrid>
            <MiniStat value={metrics.openCount.toLocaleString()} label="Open deals" />
            <MiniStat value={formatMoney(metrics.openValue)} label="Open value" />
            <MiniStat value={metrics.winRatePct === null ? '—' : `${metrics.winRatePct}%`} label="Win rate" />
            <MiniStat
              value={metrics.tasksDue.toLocaleString()}
              label="Follow-ups due"
              tone={metrics.tasksDue > 0 ? 'bad' : 'neutral'}
            />
          </MiniGrid>
        </Tile>
        <GraphTile
          label="New deals / wk"
          value={dealSeries.reduce((a, b) => a + b, 0).toLocaleString()}
          caption="8 weeks · current highlighted"
        >
          <WeekBars values={dealSeries} height={64} />
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

// ── Expansion — density readiness for the next Lab. ───────────────────────────
async function ExpansionArea() {
  const density = await getDensitySignal()
  const topSignal = density.ready[0] ?? density.places[0]

  return (
    <DashArea
      icon={TrendingUp}
      label="Expansion"
      blurb="Where local member density is crossing the threshold that justifies opening the next Lab."
      href="/admin/insights?tab=expansion"
      hrefLabel="Open Expansion"
    >
      <TileGrid>
        <Tile label="Density signal">
          <MiniGrid>
            <MiniStat value={density.totals.cities.toLocaleString()} label="Cities tracked" />
            <MiniStat
              value={density.ready.length.toLocaleString()}
              label="Labs ready"
              tone={density.ready.length > 0 ? 'good' : 'neutral'}
            />
            <MiniStat value={density.totals.listings.toLocaleString()} label="Listings" />
            <MiniStat value={density.totals.residents.toLocaleString()} label="Residents" />
          </MiniGrid>
        </Tile>
        {topSignal && (
          <Tile label="Strongest signal">
            <p className="leading-none">
              <span className="text-2xl font-bold tabular-nums text-text">{Math.round(topSignal.score)}</span>
              <span className="text-sm text-subtle">/100</span>
            </p>
            <p className="mt-2 text-sm font-semibold text-text">{topSignal.city}</p>
            <p className="mt-0.5 text-xs uppercase tracking-wide text-subtle">{topSignal.stage} stage</p>
          </Tile>
        )}
      </TileGrid>
    </DashArea>
  )
}

// ── Manage — one card per working sub-page across Acquisition, CRM, and Marketing,
// each a live stat (where cheap) + a link to the surface that edits it. ─────────
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
  // Only the cheap, verified counts read live (the same tables the KPIs above use);
  // every other surface owns its own aggregate, so its card stays "Manage" rather than
  // invent a data source.
  const [contactsC, segmentsC, campaignsC, sequencesC, qrC, automationsC] = await Promise.all([
    admin.from('contacts').select('id', { count: 'exact', head: true }),
    admin.from('segments').select('id', { count: 'exact', head: true }),
    admin.from('campaigns').select('id', { count: 'exact', head: true }),
    admin.from('nurture_sequences').select('id', { count: 'exact', head: true }),
    admin.from('qr_codes').select('id', { count: 'exact', head: true }),
    admin.from('automation_rules').select('id', { count: 'exact', head: true }),
  ])

  const acquisition: ManageCard[] = [
    { label: 'QR Studio', desc: 'Generate, design, and manage all QR codes.', stat: `${qrC.count ?? 0}`, statLabel: 'codes', href: '/admin/qr', Icon: QrCode },
    { label: 'Referrals', desc: 'The personal-code referral funnel: signups, activations, and top referrers.', stat: '', statLabel: 'Manage', href: '/admin/referrals', Icon: Share2 },
    { label: 'Walkthroughs', desc: 'Instructional walkthroughs by role and trigger.', stat: '', statLabel: 'Manage', href: '/admin/walkthroughs', Icon: GraduationCap },
    { label: 'Onboarding controls', desc: 'Turn Next Steps prompts, popups, and referrals on or off.', stat: '', statLabel: 'Manage', href: '/admin/onboarding-controls', Icon: ToggleRight },
  ]

  const crm: ManageCard[] = [
    { label: 'Contacts', desc: 'Leads, customers, and members as one record.', stat: `${contactsC.count ?? 0}`, statLabel: 'contacts', href: '/admin/crm/contacts', Icon: Contact },
    { label: 'Segments', desc: 'Saved audiences by tag and trait.', stat: `${segmentsC.count ?? 0}`, statLabel: 'segments', href: '/admin/segments', Icon: PieChart },
  ]

  const marketing: ManageCard[] = [
    { label: 'Campaigns', desc: 'Compose and send email and push broadcasts.', stat: `${campaignsC.count ?? 0}`, statLabel: 'campaigns', href: '/admin/marketing/campaigns', Icon: Megaphone },
    { label: 'Funnels', desc: 'Create, test, and compare conversion funnels.', stat: '', statLabel: 'Manage', href: '/admin/marketing/funnels', Icon: Activity },
    { label: 'Automations', desc: 'Event-triggered rules and follow-ups.', stat: `${automationsC.count ?? 0}`, statLabel: 'rules', href: '/admin/marketing/automations', Icon: SlidersHorizontal },
    { label: 'Nurture', desc: 'Sequenced nurture flows.', stat: `${sequencesC.count ?? 0}`, statLabel: 'sequences', href: '/admin/marketing/nurture', Icon: Layers },
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
