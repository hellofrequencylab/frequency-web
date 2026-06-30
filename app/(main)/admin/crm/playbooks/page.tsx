import { Suspense } from 'react'
import { Workflow, Gauge, ShieldCheck, ListChecks, PauseCircle, CheckCircle2, XCircle, Play } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { PLAYBOOK_REGISTRY, isFullyInProduct, type Playbook, type PlaybookTrigger, type AutonomyTier } from '@/lib/playbooks/registry'
import { getPausedPlaybooks } from '@/lib/playbooks/circuit-breaker'
import { autoExecutionAllowed } from '@/lib/spaces/entitlements'
import { getPlaybookActivity, type PlaybookRunRow } from '@/lib/playbooks/overview'
import { seedPlaybooks } from '@/lib/playbooks/seed'
import type { PlaybookRunStatus } from '@/lib/playbooks/runs'

// PLAYBOOKS, the registry of saved Vera plays + their run history (Resonance Engine · ADR-389 ·
// docs/ADMIN-BUILD-PLAN.md Phase 3a · docs/NEXT-GEN-CRM.md "prediction -> playbook -> action").
// Composes the AdminTemplate as an Index surface: a StatCard row, the playbook catalog (read from the
// CODE registry, the source of truth), and the recent run history (read fail-safe from playbook_runs).
//
// STAFF-GATED (requireAdmin('janitor')) like the rest of the Resonance CRM domain: a playbook governs
// member-facing actions, so the registry is a sensitive operator view. The /admin/* group mounts its
// own info rail (page-chrome returns 'none' for /admin/*), so no rail registration is needed here.
//
// READ-ONLY for v1: the catalog + history are shown; running a play and toggling autonomy live behind
// the existing governed execute path + the per-Space slider (not exposed on this page). The autonomy
// engine defaults to SUGGEST ONLY platform-wide, stated plainly so an operator knows nothing fires on
// its own. Speed: the run read sits behind its own <Suspense>; every read is fail-safe (zeros / empty)
// so the page degrades to a calm empty state, never a crash. Semantic tokens only; copy in voice
// (no em or en dashes).

export const dynamic = 'force-dynamic'

export default async function PlaybooksPage() {
  await requireAdmin('janitor')

  // Keep the durable `playbooks` table in sync with the CODE registry (the source of truth). Idempotent
  // + fail-safe: a re-run is a no-op, and a missing table / write error degrades silently (the code
  // registry still drives everything). This is the seam that populates the formerly-empty prod table.
  await seedPlaybooks()

  // The registry is the code source of truth (no IO); the breaker + autonomy reads are fail-safe.
  const [paused] = await Promise.all([getPausedPlaybooks()])
  // Platform-root autonomy: suggest_only until an owner raises a Space's slider. autoExecutionAllowed
  // (null) is the honest platform answer (false = suggest only).
  const autonomyMode = autoExecutionAllowed(null) ? 'Safe auto' : 'Suggest only'
  const pausedCount = paused.size

  return (
    <AdminTemplate
      title="Playbooks"
      eyebrow="CRM"
      icon={Workflow}
      description="The saved Vera plays: each binds one prediction to one governed, reversible action. Vera drafts, you approve. Nothing member-facing ever fires on its own."
      width="wide"
    >
      <AdminSection>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Playbooks"
            value={PLAYBOOK_REGISTRY.length}
            icon={ListChecks}
            detail="saved plays in the registry"
          />
          <Suspense fallback={<StatSkeleton />}>
            <RunsStat />
          </Suspense>
          <StatCard
            label="Autonomy"
            value={autonomyMode}
            size="sm"
            icon={Gauge}
            detail="the platform default for safe plays"
          />
          <StatCard
            label="Circuit breaker"
            value={pausedCount === 0 ? 'All clear' : `${pausedCount} paused`}
            size="sm"
            icon={pausedCount === 0 ? ShieldCheck : PauseCircle}
            detail={pausedCount === 0 ? 'no play is misfiring' : 'paused for too many wave-offs'}
          />
        </div>
      </AdminSection>

      <AdminSection
        title="The registry"
        description="Every saved play, the signal that selects it, and how much it may do on its own."
      >
        <PlaybookRegistryTable paused={paused} />
      </AdminSection>

      <AdminSection
        title="Recent runs"
        description="What ran lately, and how it landed. A wave-off teaches the next night's ranking."
      >
        <Suspense fallback={<PanelSkeleton />}>
          <RunHistorySection />
        </Suspense>
      </AdminSection>
    </AdminTemplate>
  )
}

// ── The StatCard that needs the fail-safe run read (its own boundary) ───────────

async function RunsStat() {
  const { overview } = await getPlaybookActivity()
  return (
    <StatCard
      label="Runs this week"
      value={overview.degraded ? '0' : overview.runsThisWeek}
      icon={Play}
      detail={overview.degraded ? 'nothing recorded yet' : `${overview.doneThisWeek} ran, the rest waved off`}
    />
  )
}

// ── The registry table (read from the code registry, the source of truth) ───────

const TIER_LABEL: Record<AutonomyTier, string> = {
  auto: 'Auto',
  suggest: 'Suggest',
  never_auto: 'Never auto',
}

const TIER_DOT: Record<AutonomyTier, string> = {
  auto: 'bg-success',
  suggest: 'bg-warning',
  never_auto: 'bg-danger',
}

/** A plain phrase for the signal that fires a playbook (no jargon). PURE. */
function triggerLabel(trigger: PlaybookTrigger): string {
  if (trigger.kind === 'next_best_action') {
    const phrases: Record<string, string> = {
      reengage: 'When the model says reengage',
      activate: 'When a new member needs a first step',
      join_circle: 'When someone should join a Circle',
      deepen: 'When an active member can go deeper',
      invite: 'When a power member can advocate',
      none: 'When nothing needs doing',
    }
    return phrases[trigger.value] ?? 'On a next best action'
  }
  if (trigger.kind === 'churn_risk') {
    const phrases: Record<string, string> = {
      high: 'When churn risk runs high',
      medium: 'When churn risk is rising',
      low: 'When a member is healthy',
    }
    return phrases[trigger.value] ?? 'On a churn risk signal'
  }
  return 'When a payment fails'
}

function PlaybookRegistryTable({ paused }: { paused: Set<string> }) {
  if (PLAYBOOK_REGISTRY.length === 0) {
    return (
      <EmptyState
        variant="first-use"
        title="No playbooks yet"
        description="Saved plays show here once the registry declares them. The engine starts in suggest only, so nothing fires until you approve it."
      />
    )
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <ul className="divide-y divide-border">
        {PLAYBOOK_REGISTRY.map((p) => (
          <PlaybookRow key={p.id} playbook={p} paused={paused.has(p.id)} />
        ))}
      </ul>
    </div>
  )
}

function PlaybookRow({ playbook, paused }: { playbook: Playbook; paused: boolean }) {
  const stepCount = playbook.actions.length
  const inProductOnly = isFullyInProduct(playbook)
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-bold text-text">{playbook.name}</p>
          {paused && (
            <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
              <PauseCircle className="h-3 w-3" aria-hidden /> Paused
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted">{triggerLabel(playbook.trigger)}</p>
        <p className="mt-1 text-sm text-subtle">{playbook.rationale}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-text">
          <span className={`h-2 w-2 rounded-full ${TIER_DOT[playbook.autonomyTier]}`} aria-hidden />
          {TIER_LABEL[playbook.autonomyTier]}
        </span>
        <span className="text-xs text-subtle">
          {stepCount === 0 ? 'no steps' : `${stepCount} ${stepCount === 1 ? 'step' : 'steps'}`}
          {inProductOnly && stepCount > 0 ? ' · in product' : ''}
        </span>
      </div>
    </li>
  )
}

// ── The run history (fail-safe read) ────────────────────────────────────────────

const STATUS_PRESENT: Record<PlaybookRunStatus, { label: string; tone: string; Icon: typeof CheckCircle2 }> = {
  done: { label: 'Ran', tone: 'text-success', Icon: CheckCircle2 },
  dismissed: { label: 'Waved off', tone: 'text-subtle', Icon: XCircle },
  failed: { label: 'Failed', tone: 'text-danger', Icon: XCircle },
  proposed: { label: 'Proposed', tone: 'text-muted', Icon: Play },
}

function formatWhen(iso: string | null): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const days = Math.floor((Date.now() - t) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  const weeks = Math.floor(days / 7)
  return weeks === 1 ? 'a week ago' : `${weeks} weeks ago`
}

async function RunHistorySection() {
  const { runs } = await getPlaybookActivity()
  if (runs.length === 0) {
    return (
      <EmptyState
        variant="first-use"
        title="No runs yet"
        description="When a play is proposed, run, or waved off, it shows here with the outcome. The engine starts in suggest only, so the first runs appear once you approve a draft on Today."
      />
    )
  }
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-sm">
      {runs.map((run, i) => (
        <RunRow key={`${run.playbookId}-${run.startedAt ?? i}`} run={run} />
      ))}
    </ul>
  )
}

function RunRow({ run }: { run: PlaybookRunRow }) {
  const present = STATUS_PRESENT[run.status]
  const when = formatWhen(run.startedAt)
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <present.Icon className={`h-4 w-4 shrink-0 ${present.tone}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text">{run.playbookName}</p>
        <p className="text-xs text-muted">
          {present.label}
          {when ? ` · ${when}` : ''}
          {run.outcome ? ` · ${run.outcome}` : ''}
        </p>
      </div>
    </li>
  )
}

// ── Skeletons (paint while a fail-safe read resolves) ───────────────────────────

function StatSkeleton() {
  return <div className="h-20 animate-pulse rounded-2xl bg-surface-elevated/50" />
}

function PanelSkeleton() {
  return <div className="h-44 animate-pulse rounded-2xl bg-surface-elevated/50" />
}
