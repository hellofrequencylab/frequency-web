import { PauseCircle } from 'lucide-react'
import { AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import {
  PLAYBOOK_REGISTRY,
  isFullyInProduct,
  type Playbook,
  type PlaybookTrigger,
  type AutonomyTier,
} from '@/lib/playbooks/registry'
import { getPausedPlaybooks } from '@/lib/playbooks/circuit-breaker'

// Playbooks layout module (ADR-270/294): the registry table — every saved play, the signal that
// selects it, and how much it may do on its own. Read from the CODE registry (the source of truth,
// no IO); the breaker read is fail-safe. Self-fetching RSC; shows the first-use empty if the registry
// is ever empty. The page owns the staff gate, so the module never re-gates.
export async function CrmPlaybooksRegistry() {
  const paused = await getPausedPlaybooks()

  return (
    <AdminSection
      title="The registry"
      description="Every saved play, the signal that selects it, and how much it may do on its own."
    >
      {PLAYBOOK_REGISTRY.length === 0 ? (
        <EmptyState
          variant="first-use"
          title="No playbooks yet"
          description="Saved plays show here once the registry declares them. The engine starts in suggest only, so nothing fires until you approve it."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          <ul className="divide-y divide-border">
            {PLAYBOOK_REGISTRY.map((p) => (
              <PlaybookRow key={p.id} playbook={p} paused={paused.has(p.id)} />
            ))}
          </ul>
        </div>
      )}
    </AdminSection>
  )
}

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
