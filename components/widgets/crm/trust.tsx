import { AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { runChurnBacktest } from '@/lib/playbooks/backtest'

// Resonance CRM layout module (LP7, ADR-270/294): "Can you trust the scores" (Phase 3 · ADR-384) — the
// backtest of predicted churn vs actual dormancy, so an operator knows whether to trust the scores.
// Self-fetching RSC; the page owns the janitor gate, so this never re-gates. Fail-safe: the read returns
// the honest "not enough history" report on any error, so this degrades to a calm empty, never a crash.
export async function CrmTrust() {
  const report = await runChurnBacktest()

  return (
    <AdminSection title="Can you trust the scores" description="A backtest of the churn risk calls against what actually happened.">
      {!report.trustworthy ? (
        <EmptyState
          variant="first-use"
          title="Not enough history yet"
          description="Once a few cycles of predictions have something to compare against, the score trustworthiness shows here."
        />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-text">{report.verdict}</p>
          <div className="grid grid-cols-3 gap-3">
            {report.calibration.map((c) => (
              <StatCard
                key={c.band}
                label={`Predicted ${c.band}`}
                value={`${Math.round(c.actualDormantRate * 100)}%`}
                detail={`went dormant · ${c.count} ${c.count === 1 ? 'member' : 'members'}`}
              />
            ))}
          </div>
        </div>
      )}
    </AdminSection>
  )
}
