import { Suspense } from 'react'
import {
  Users,
  CheckCircle2,
  UserPlus,
  Activity,
  Send,
  MailCheck,
  MailOpen,
  MousePointerClick,
  MailX,
  Target,
} from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { AdminSection } from '@/components/templates'
import { Tile, MiniStat, MiniGrid } from '@/components/admin/dash'
import { RingGauge } from '@/components/admin/spark-charts'
import {
  getBetaStats,
  getBetaEmailEngagement,
  getBetaGrowthFunnel,
  type BetaFunnelStep,
} from '@/lib/beta/stats'

// STATS — the Beta metrics board (Wave 2). It composes analytics we already ship
// (waitlist reads, the engagement ledger, email events, the Growth-OS funnel)
// into one read; it does not build a new metrics engine. Server Component: each
// slow read streams behind its own <Suspense> so the tab paints immediately
// (PAGE-FRAMEWORK §5). Every scope caveat and un-instrumented metric is labelled
// at the edge — we never fabricate a number.

const WINDOW_DAYS = 30

export function BetaStatsSection() {
  return (
    <div className="space-y-8">
      <Suspense fallback={<BlockSkeleton lines={3} />}>
        <FunnelBlock windowDays={WINDOW_DAYS} />
      </Suspense>

      <Suspense fallback={<BlockSkeleton lines={2} />}>
        <EmailBlock windowDays={WINDOW_DAYS} />
      </Suspense>

      <Suspense fallback={<BlockSkeleton lines={1} />}>
        <GrowthFunnelBlock windowDays={WINDOW_DAYS} />
      </Suspense>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Block 1 — waitlist funnel, member activation, weekly signups, north star.
// ---------------------------------------------------------------------------

async function FunnelBlock({ windowDays }: { windowDays: number }) {
  const stats = await getBetaStats(windowDays)
  const { waitlist, funnel, activation, activationConversion, weeklySignups, northStar } = stats

  const activationEnd = activation[activation.length - 1]
  const activationTop = activation[0]

  return (
    <div className="space-y-8">
      <AdminSection title="The Beta at a glance" description={`Live waitlist reads. Last ${windowDays} days.`}>
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <StatCard label="Waitlisted" value={waitlist.total.toLocaleString()} icon={Users} />
          <StatCard
            label="Confirmed"
            value={waitlist.confirmed.toLocaleString()}
            icon={CheckCircle2}
            detail={`${waitlist.pending.toLocaleString()} pending`}
          />
          <StatCard label="Admitted" value={waitlist.invited.toLocaleString()} icon={UserPlus} />
          <StatCard
            label="New signups per week"
            value={weeklySignups[weeklySignups.length - 1]?.toLocaleString() ?? '0'}
            icon={Activity}
            sparkline={weeklySignups}
            detail="12-week trend"
          />
        </div>
      </AdminSection>

      <AdminSection
        title="Launch funnel"
        description="Waitlisted through founding. Beta-scoped stages are real; the later stages are labelled."
      >
        <Tile>
          <FunnelList steps={funnel} />
        </Tile>
      </AdminSection>

      <AdminSection
        title="Member activation"
        description={`Where new members drop between induction and a verified practice. All members, last ${windowDays} days.`}
      >
        <div className="grid gap-3.5 lg:grid-cols-3">
          <Tile
            label="Activation funnel"
            caption="Global signal, not yet Beta-scoped. Verified practice is the North-Star moment."
            span={2}
          >
            <FunnelList
              steps={activation.map((f) => ({
                key: f.eventType,
                label: f.step,
                value: f.actors,
                dropPct: f.dropPct,
                scope: 'global' as const,
              }))}
            />
          </Tile>
          <Tile label="Induction → verified" caption="End-to-end activation conversion.">
            {activationConversion == null || (activationTop?.actors ?? 0) === 0 ? (
              <p className="text-sm text-subtle">Not enough activity in the window yet.</p>
            ) : (
              <RingGauge
                pct={activationConversion}
                label={`${formatPct(activationConversion)} activate`}
                sub={`${(activationEnd?.actors ?? 0).toLocaleString()} of ${(activationTop?.actors ?? 0).toLocaleString()} members`}
              />
            )}
          </Tile>
        </div>
      </AdminSection>

      <AdminSection
        title="North-star metrics"
        description="The four that matter. Placeholders below are queued for instrumentation, not fabricated."
      >
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {northStar.map((m) => (
            <StatCard
              key={m.key}
              label={m.label}
              value={m.value ?? 'To instrument'}
              icon={Target}
              detail={m.detail}
            />
          ))}
        </div>
      </AdminSection>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Block 2 — email engagement (global; labelled).
// ---------------------------------------------------------------------------

async function EmailBlock({ windowDays }: { windowDays: number }) {
  const e = await getBetaEmailEngagement(windowDays)
  const sentEmpty = e.sent === 0 && e.delivered === 0

  return (
    <AdminSection
      title="Email engagement"
      description={`Sends across the last ${windowDays} days. Platform-wide, not Beta-scoped: the sender does not tag events by audience yet.`}
    >
      {sentEmpty ? (
        <EmptyState
          variant="first-use"
          title="No email activity in the window"
          description="Once an admission wave or Beta campaign goes out, delivery and engagement land here."
        />
      ) : (
        <div className="grid gap-3.5 lg:grid-cols-3">
          <Tile label="Volume" caption="Events recorded from the send provider." span={2}>
            <MiniGrid>
              <MiniStat value={e.sent.toLocaleString()} label="Sent" />
              <MiniStat value={e.delivered.toLocaleString()} label="Delivered" />
              <MiniStat value={e.opened.toLocaleString()} label="Opened" />
              <MiniStat value={e.clicked.toLocaleString()} label="Clicked" />
              <MiniStat value={e.bounced.toLocaleString()} label="Bounced" tone={e.bounced > 0 ? 'bad' : 'neutral'} />
              <MiniStat
                value={e.suppressed.toLocaleString()}
                label="Suppressed"
                tone={e.suppressed > 0 ? 'bad' : 'neutral'}
              />
            </MiniGrid>
          </Tile>
          <Tile label="Delivery" caption="Delivered of delivered-plus-bounced.">
            <RingGauge
              pct={e.deliveryRate}
              label={`${formatPct(e.deliveryRate)} delivered`}
              sub={`${formatPct(e.openRate)} open · ${formatPct(e.clickRate)} click`}
            />
          </Tile>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-subtle">
        <span className="inline-flex items-center gap-1">
          <Send className="h-3.5 w-3.5" aria-hidden /> {e.sent.toLocaleString()} sent
        </span>
        <span className="inline-flex items-center gap-1">
          <MailCheck className="h-3.5 w-3.5" aria-hidden /> {formatPct(e.deliveryRate)} delivery
        </span>
        <span className="inline-flex items-center gap-1">
          <MailOpen className="h-3.5 w-3.5" aria-hidden /> {formatPct(e.openRate)} open
        </span>
        <span className="inline-flex items-center gap-1">
          <MousePointerClick className="h-3.5 w-3.5" aria-hidden /> {formatPct(e.clickRate)} click
        </span>
        <span className="inline-flex items-center gap-1">
          <MailX className="h-3.5 w-3.5" aria-hidden /> {e.bounced.toLocaleString()} bounced
        </span>
      </div>
    </AdminSection>
  )
}

// ---------------------------------------------------------------------------
// Block 3 — Growth-OS beta funnel rollup (optional; only if one is authored).
// ---------------------------------------------------------------------------

async function GrowthFunnelBlock({ windowDays }: { windowDays: number }) {
  const rollup = await getBetaGrowthFunnel(windowDays)
  if (!rollup) return null

  return (
    <AdminSection
      title="Funnel rollup"
      description={`From the Growth-OS funnel "${rollup.funnel.name}". Last ${windowDays} days.`}
    >
      {rollup.stages.length === 0 ? (
        <EmptyState
          variant="first-use"
          title="No stage activity yet"
          description="This funnel is authored but has not recorded actors in the window."
        />
      ) : (
        <Tile>
          <FunnelList
            steps={rollup.stages.map((st) => ({
              key: st.stageId,
              label: st.label,
              value: st.actors,
              dropPct: st.dropPct,
              scope: 'global' as const,
            }))}
          />
        </Tile>
      )}
    </AdminSection>
  )
}

// ---------------------------------------------------------------------------
// Presentational helpers (server-friendly; semantic tokens only).
// ---------------------------------------------------------------------------

/** A stepped funnel: label, count, a proportional bar, and step-over-step drop.
 *  Un-instrumented steps (value null) render a dashed rail with their note. */
function FunnelList({ steps }: { steps: BetaFunnelStep[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value ?? 0))
  return (
    <ol className="space-y-3">
      {steps.map((s) => {
        const width = s.value != null ? Math.max((s.value / max) * 100, s.value > 0 ? 4 : 0) : 0
        return (
          <li key={s.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-text">
                {s.label}
                {s.scope === 'global' && (
                  <span className="ml-2 rounded-full bg-surface-elevated px-1.5 py-0.5 text-2xs font-semibold text-subtle">
                    all members
                  </span>
                )}
              </span>
              <span className="shrink-0 text-sm tabular-nums text-muted">
                {s.value != null ? s.value.toLocaleString() : 'To instrument'}
                {s.dropPct != null && s.dropPct > 0 && (
                  <span className="ml-2 text-2xs font-semibold text-danger">-{s.dropPct}%</span>
                )}
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-elevated">
              {s.value != null ? (
                <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
              ) : (
                <div className="h-full rounded-full border border-dashed border-border" />
              )}
            </div>
            {s.note && <p className="mt-1 text-2xs leading-snug text-subtle">{s.note}</p>}
          </li>
        )
      })}
    </ol>
  )
}

function BlockSkeleton({ lines }: { lines: number }) {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="h-4 w-40 animate-pulse rounded bg-surface-elevated" />
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {Array.from({ length: Math.max(2, lines) }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-elevated/70" />
        ))}
      </div>
    </div>
  )
}

function formatPct(v: number): string {
  return `${Math.round(v * 100)}%`
}
