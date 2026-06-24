import { Suspense } from 'react'
import Link from 'next/link'
import { Network, Users2, Link2, HeartPulse, ArrowUpRight, ShieldCheck } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { getPlatformHealth } from '@/lib/dashboard/scores'
import { healthTone } from '@/lib/dashboard/verdict'
import { ToneStat } from '../tone-stat'
import {
  getGraphOverview,
  getStrongestConnections,
  type GraphOverview,
  type StrongConnection,
  type ConnectionParty,
} from '@/lib/resonance/graph-overview'

// RESONANCE GRAPH, the consent-first relationship + health view (Resonance Engine · ADR-389 ·
// docs/ADMIN-BUILD-PLAN.md Phase 3b · docs/NEXT-GEN-CRM.md "The Resonance Graph"). Composes the
// AdminTemplate as a Dashboard surface: a metric row (consented members, live edges, mean resonance
// health), then the relationship view as a RANKED, ACCESSIBLE list of the strongest consented
// connections (no heavy graph-viz dependency; semantic tokens only), each linking to Member
// Intelligence.
//
// CONSENT IS MANDATORY (the trust moat). An edge only ever exists for two members who BOTH opted in
// to matching (the nightly refresh + the read both enforce it), so this page can NEVER fabricate or
// over-surface a connection. The empty state explains the consent gate plainly and shows nothing when
// no one has opted in. This is the literal expression of resonate, do not extract.
//
// STAFF-GATED: requireAdmin('janitor', { staff: 'insights', staffLevel: 'read' }), the per-member
// relationship graph is sensitive, so it needs the staff floor OR a read-level insights staff role
// (the gate the build plan + sections.ts advertise for this surface). The /admin/* group mounts its
// own info rail (page-chrome 'none'), so no rail registration is needed here.
//
// Speed: each heavy read sits behind its own <Suspense>; every read is fail-safe (zeros / empty), so
// the dashboard degrades to a calm, consent-explaining empty state and never crashes. Semantic tokens
// only; copy in voice (no em or en dashes).

export const dynamic = 'force-dynamic'

const MEMBER_INTEL = '/admin/crm/members'

export default async function ResonanceGraphPage() {
  await requireAdmin('janitor', { staff: 'insights', staffLevel: 'read' })

  return (
    <AdminTemplate
      title="Resonance Graph"
      eyebrow="CRM"
      icon={Network}
      description="Who resonates with whom, double opt-in only. A connection shows here only when both members chose to be matched, so this is consent first by construction."
      width="wide"
    >
      <AdminSection>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Suspense fallback={<StatSkeleton />}>
            <MetricRow />
          </Suspense>
        </div>
      </AdminSection>

      <AdminSection
        title="Strongest connections"
        description="The highest-resonance ties between consenting members, with the plain reason behind each. Tap a member to open their intelligence."
      >
        <Suspense fallback={<PanelSkeleton />}>
          <ConnectionsSection />
        </Suspense>
      </AdminSection>
    </AdminTemplate>
  )
}

// ── The metric row (consented members · edges · mean resonance health) ──────────

async function MetricRow() {
  // Two fail-safe reads in parallel: the graph counts + the platform health (shared with the cockpit).
  const [overview, { summary }] = await Promise.all([getGraphOverview(), getPlatformHealth()])
  return <Metrics overview={overview} meanHealth={summary.meanHealth} scored={summary.members} />
}

function Metrics({ overview, meanHealth, scored }: { overview: GraphOverview; meanHealth: number; scored: number }) {
  return (
    <>
      <StatCard
        label="Consented members"
        value={overview.degraded ? '0' : overview.consentedMembers}
        icon={Users2}
        detail={overview.degraded ? 'no one opted in yet' : 'opted in to matching'}
      />
      <StatCard
        label="Live connections"
        value={overview.degraded ? '0' : overview.edges}
        icon={Link2}
        detail={overview.degraded ? 'no connections yet' : 'double opt-in ties, still fresh'}
      />
      <ToneStat
        label="Resonance Health"
        value={scored === 0 ? 'Not yet' : Math.round(meanHealth)}
        icon={HeartPulse}
        tone={scored === 0 ? 'flat' : healthTone(meanHealth)}
        detail={scored === 0 ? 'no members scored yet' : `mean across ${scored} scored`}
      />
    </>
  )
}

// ── The relationship view: a ranked, accessible list (no graph-viz dependency) ──

async function ConnectionsSection() {
  const connections = await getStrongestConnections()
  if (connections.length === 0) {
    return (
      <EmptyState
        variant="first-use"
        icon={ShieldCheck}
        title="No consented connections yet"
        description="Only relationships where both members opted in to matching appear here. As members opt in, the overnight refresh finds the ties they share and the strongest ones show up first. Nothing is ever shown without both sides saying yes."
      />
    )
  }
  return (
    <ul className="space-y-3">
      {connections.map((c, i) => (
        <ConnectionRow key={`${c.a.profileId}-${c.b.profileId}-${i}`} connection={c} rank={i + 1} />
      ))}
    </ul>
  )
}

/** A score band → semantic tone for the strength meter (mirrors the health legend bands). */
function scoreTone(score: number): string {
  if (score >= 0.5) return 'bg-success'
  if (score >= 0.25) return 'bg-warning'
  return 'bg-primary'
}

function ConnectionRow({ connection, rank }: { connection: StrongConnection; rank: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, connection.score)) * 100)
  const reasons = connection.reasons.map((r) => r.label)
  const why = reasons.length ? reasons.join(' and ') : 'a shared affinity'
  return (
    <li className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          <span className="text-xs font-bold tabular-nums text-subtle">{rank}</span>
          <PartyLink party={connection.a} />
          <span className="shrink-0 text-subtle">resonates with</span>
          <PartyLink party={connection.b} />
        </div>
        <span className="shrink-0 text-sm font-bold tabular-nums text-text">{pct}%</span>
      </div>
      {/* The strength meter: an accessible bar, semantic tokens only (no graph-viz, no hardcoded hex). */}
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-elevated"
        role="img"
        aria-label={`Resonance strength ${pct} percent`}
      >
        <div className={`h-full rounded-full ${scoreTone(connection.score)}`} style={{ width: `${Math.max(4, pct)}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted">Because {why}.</p>
    </li>
  )
}

/** One member, linking to Member Intelligence (the per-node drill) when a contact is stitched. */
function PartyLink({ party }: { party: ConnectionParty }) {
  const name = <span className="truncate font-semibold text-text">{party.name}</span>
  if (!party.contactId) return <span className="min-w-0 truncate">{name}</span>
  return (
    <Link
      href={`${MEMBER_INTEL}?tier=resonant`}
      className="group inline-flex min-w-0 items-center gap-0.5 truncate text-text transition-colors hover:text-primary-strong"
    >
      {name}
      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary-strong" />
    </Link>
  )
}

// ── Skeletons (paint while a fail-safe read resolves) ───────────────────────────

function StatSkeleton() {
  return (
    <>
      <div className="h-20 animate-pulse rounded-2xl bg-surface-elevated/50" />
      <div className="h-20 animate-pulse rounded-2xl bg-surface-elevated/50" />
      <div className="h-20 animate-pulse rounded-2xl bg-surface-elevated/50" />
    </>
  )
}

function PanelSkeleton() {
  return <div className="h-44 animate-pulse rounded-2xl bg-surface-elevated/50" />
}
