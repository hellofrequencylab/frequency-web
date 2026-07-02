import { getPracticeRetention } from '@/lib/analytics/practice'
import { AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'

// Marketing analytics layout module (ADR-270/294): the practice-retention cohort heatmap — W0 is
// each cohort's first week (100%); later columns are the share still logging a practice that week,
// the practice-retention (PMF) signal. Self-fetching RSC. It keeps its own first-use empty (the
// "cohorts appear once members start logging" note is operator guidance, not noise), so it renders
// the empty rather than nulling out.
export async function MarketingAnalyticsRetention() {
  const retention = await getPracticeRetention(8)
  const maxWeeks = retention.reduce((m, c) => Math.max(m, c.retention.length), 0)

  return (
    <AdminSection
      title="Practice retention · weekly cohorts"
      description="W0 is each cohort’s first week (100%). Later columns are the share still logging a practice that week, the practice-retention (PMF) signal."
    >
      {retention.length === 0 ? (
        <EmptyState
          variant="first-use"
          title="No verified practices yet"
          description="Cohorts appear once members start logging."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
          <table className="w-full text-sm">
            <caption className="sr-only">Weekly practice-retention cohorts</caption>
            <thead>
              <tr className="border-b border-border bg-surface-elevated/50 text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="px-3 py-2.5 text-left font-semibold">Cohort (week of)</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Members</th>
                {Array.from({ length: maxWeeks }).map((_, i) => (
                  <th key={i} scope="col" className="px-3 py-2.5 text-right font-semibold">W{i}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {retention.map((c) => (
                <tr key={c.weekStart}>
                  <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-medium text-text">{c.weekStart}</th>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{c.size}</td>
                  {Array.from({ length: maxWeeks }).map((_, i) => (
                    <td
                      key={i}
                      className={
                        'px-3 py-2 text-right tabular-nums ' +
                        (i >= c.retention.length
                          ? 'text-subtle'
                          : c.retention[i] >= 40
                            ? 'font-medium text-success'
                            : 'text-muted')
                      }
                    >
                      {i < c.retention.length ? `${c.retention[i]}%` : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminSection>
  )
}
