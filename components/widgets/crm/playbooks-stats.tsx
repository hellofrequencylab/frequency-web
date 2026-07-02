import { Gauge, ShieldCheck, ListChecks, PauseCircle, Play } from 'lucide-react'
import { AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { PLAYBOOK_REGISTRY } from '@/lib/playbooks/registry'
import { getPausedPlaybooks } from '@/lib/playbooks/circuit-breaker'
import { autoExecutionAllowed } from '@/lib/spaces/entitlements'
import { getPlaybookActivity } from '@/lib/playbooks/overview'

// Playbooks layout module (ADR-270/294): the headline stat band — saved plays, runs this week, the
// platform autonomy default, and the circuit breaker. Self-fetching RSC; always renders. The breaker
// + activity reads are fail-safe (zeros / empty), and the registry count is pure (no IO), so the band
// degrades to honest zeros rather than a crash. The page owns the staff gate, so the module never
// re-gates. autoExecutionAllowed(null) is the honest platform-root answer (suggest only by default).
export async function CrmPlaybooksStats() {
  const [paused, { overview }] = await Promise.all([getPausedPlaybooks(), getPlaybookActivity()])
  const autonomyMode = autoExecutionAllowed(null) ? 'Safe auto' : 'Suggest only'
  const pausedCount = paused.size

  return (
    <AdminSection>
      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
        <StatCard
          label="Playbooks"
          value={PLAYBOOK_REGISTRY.length}
          icon={ListChecks}
          detail="saved plays in the registry"
        />
        <StatCard
          label="Runs this week"
          value={overview.degraded ? '0' : overview.runsThisWeek}
          icon={Play}
          detail={overview.degraded ? 'nothing recorded yet' : `${overview.doneThisWeek} ran, the rest waved off`}
        />
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
  )
}
