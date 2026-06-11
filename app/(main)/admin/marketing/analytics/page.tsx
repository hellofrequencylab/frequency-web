import { getPracticeMetrics, getPracticeRetention } from '@/lib/analytics/practice'
import { getEmailStats, getStudioCounts } from '@/lib/studio/analytics'
import { AdminTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'

export const dynamic = 'force-dynamic'

const EMAIL_TYPES = ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained'] as const

export default async function AnalyticsPage() {
  const [practice, retention, email, counts] = await Promise.all([
    getPracticeMetrics(),
    getPracticeRetention(8),
    getEmailStats(30),
    getStudioCounts(),
  ])

  const maxWeeks = retention.reduce((m, c) => Math.max(m, c.retention.length), 0)

  return (
    <AdminTemplate
      eyebrow="Marketing"
      title="Analytics"
      description="Read-models off the one event backbone + the email log."
    >
      <section>
        <SectionHeader title="North Star · Verified practice" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Weekly Active Members" value={practice.wam.toLocaleString()} />
          <StatCard label="Practices this week" value={practice.verifiedThisWeek.toLocaleString()} />
          <StatCard label="Activation 7d" value={`${Math.round(practice.activationRate * 100)}%`} />
          <StatCard label="New members 30d" value={practice.newMembers.toLocaleString()} />
        </div>
      </section>

      <section>
        <SectionHeader title="Practice retention · weekly cohorts" />
        {retention.length === 0 ? (
          <EmptyState
            title="No verified practices yet"
            description="Cohorts appear once members start logging."
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-subtle">
                  <th className="px-3 py-2 text-left font-semibold">Cohort (week of)</th>
                  <th className="px-3 py-2 text-right font-semibold">Members</th>
                  {Array.from({ length: maxWeeks }).map((_, i) => (
                    <th key={i} className="px-3 py-2 text-right font-semibold">W{i}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {retention.map((c) => (
                  <tr key={c.weekStart} className="border-t border-border">
                    <td className="px-3 py-2 text-text whitespace-nowrap">{c.weekStart}</td>
                    <td className="px-3 py-2 text-right text-muted">{c.size}</td>
                    {Array.from({ length: maxWeeks }).map((_, i) => (
                      <td
                        key={i}
                        className={
                          'px-3 py-2 text-right tabular-nums ' +
                          (i >= c.retention.length
                            ? 'text-subtle'
                            : c.retention[i] >= 40
                              ? 'text-success font-medium'
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
        <p className="text-xs text-subtle mt-2">
          W0 is each cohort&rsquo;s first week (100%). Later columns are the share still
          logging a practice that week, the practice-retention (PMF) signal.
        </p>
      </section>

      <section>
        <SectionHeader title="CRM" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Contacts" value={counts.contacts.toLocaleString()} />
          <StatCard label="Campaigns" value={counts.campaigns.toLocaleString()} />
          <StatCard label="Suppressed" value={email.suppressed.toLocaleString()} />
        </div>
      </section>

      <section>
        <SectionHeader title={`Email · last ${email.windowDays} days`} />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {EMAIL_TYPES.map((t) => (
            <StatCard key={t} label={t[0].toUpperCase() + t.slice(1)} value={(email.byType[t] ?? 0).toLocaleString()} />
          ))}
        </div>
        <p className="text-xs text-subtle mt-2">
          Deliverability: {Math.round(email.deliveryRate * 100)}% (delivered vs bounced).
          Open/click/bounce data populates once the Resend webhook is configured.
        </p>
      </section>
    </AdminTemplate>
  )
}
