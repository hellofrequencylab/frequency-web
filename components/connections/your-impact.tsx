import { getYourImpact } from '@/lib/connections/metrics'

// "Your roots" — the member's own private lead-funnel view (ADR-186, P6). A warm,
// compact card of the people on Frequency because of them. Caller-scoped read only;
// renders nothing until you've actually brought someone in. Aggregate counts about
// the caller's own reach — never names, never a leaderboard.

function ImpactStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface-elevated/60 px-3 py-2.5 text-center">
      <div className="text-2xl font-bold leading-none tabular-nums text-text">{value}</div>
      <div className="mt-1.5 text-2xs text-subtle">{label}</div>
    </div>
  )
}

export async function YourImpact() {
  const impact = await getYourImpact()
  if (!impact) return null

  return (
    <section className="rounded-3xl border border-border bg-surface-elevated/40 p-5">
      <h2 className="text-sm font-bold tracking-tight text-text">Your impact</h2>
      <p className="mt-0.5 text-xs text-muted">People on Frequency because of you.</p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ImpactStat label="Brought in" value={impact.brought.toLocaleString()} />
        <ImpactStat label="Activated" value={impact.activated.toLocaleString()} />
        <ImpactStat
          label="Avg. days to join"
          value={impact.avgDaysToActivate == null ? '–' : impact.avgDaysToActivate.toLocaleString()}
        />
        <ImpactStat label="Became connectors" value={impact.catalysts.toLocaleString()} />
      </div>
    </section>
  )
}
