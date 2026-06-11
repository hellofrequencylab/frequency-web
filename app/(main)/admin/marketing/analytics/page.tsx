import { Suspense } from 'react'
import { getPracticeMetrics, getPracticeRetention } from '@/lib/analytics/practice'
import { getEmailStats, getStudioCounts } from '@/lib/studio/analytics'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { TableSkeleton } from '@/components/admin/table-skeleton'
import { FreshnessNote } from '@/components/admin/freshness-note'

export const dynamic = 'force-dynamic'

const EMAIL_TYPES = ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained'] as const

// Marketing analytics (ADR-233 §3 Analytics): StatCard rows for the read-models off the
// one event backbone + email log, plus the practice-retention cohort heatmap. Each slow
// read sits behind its own Suspense so the shell paints first (ADR-233 §5).
export default async function AnalyticsPage() {
  return (
    <AdminTemplate
      eyebrow="Marketing"
      title="Analytics"
      description="Read-models off the one event backbone + the email log."
      width="wide"
    >
      <AdminSection title="North Star · Verified practice" actions={<FreshnessNote at={new Date()} />}>
        <Suspense fallback={<KpiSkeleton n={4} />}>
          <NorthStar />
        </Suspense>
      </AdminSection>

      <AdminSection
        title="Practice retention · weekly cohorts"
        description="W0 is each cohort’s first week (100%). Later columns are the share still logging a practice that week, the practice-retention (PMF) signal."
      >
        <Suspense fallback={<TableSkeleton rows={6} cols={6} />}>
          <Retention />
        </Suspense>
      </AdminSection>

      <AdminSection title="CRM">
        <Suspense fallback={<KpiSkeleton n={3} />}>
          <CrmCounts />
        </Suspense>
      </AdminSection>

      <AdminSection title="Email">
        <Suspense fallback={<KpiSkeleton n={6} />}>
          <Email />
        </Suspense>
      </AdminSection>
    </AdminTemplate>
  )
}

async function NorthStar() {
  const practice = await getPracticeMetrics()
  return (
    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
      <StatCard label="Weekly Active Members" value={practice.wam.toLocaleString()} />
      <StatCard label="Practices this week" value={practice.verifiedThisWeek.toLocaleString()} />
      <StatCard label="Activation 7d" value={`${Math.round(practice.activationRate * 100)}%`} />
      <StatCard label="New members 30d" value={practice.newMembers.toLocaleString()} />
    </div>
  )
}

async function Retention() {
  const retention = await getPracticeRetention(8)
  const maxWeeks = retention.reduce((m, c) => Math.max(m, c.retention.length), 0)

  if (retention.length === 0) {
    return (
      <EmptyState
        variant="first-use"
        title="No verified practices yet"
        description="Cohorts appear once members start logging."
      />
    )
  }

  return (
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
  )
}

async function CrmCounts() {
  const [email, counts] = await Promise.all([getEmailStats(30), getStudioCounts()])
  return (
    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
      <StatCard label="Contacts" value={counts.contacts.toLocaleString()} href="/admin/marketing/contacts" />
      <StatCard label="Campaigns" value={counts.campaigns.toLocaleString()} href="/admin/marketing/campaigns" />
      <StatCard label="Suppressed" value={email.suppressed.toLocaleString()} />
    </div>
  )
}

async function Email() {
  const email = await getEmailStats(30)
  return (
    <>
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
        {EMAIL_TYPES.map((t) => (
          <StatCard key={t} label={t[0].toUpperCase() + t.slice(1)} value={(email.byType[t] ?? 0).toLocaleString()} />
        ))}
      </div>
      <p className="mt-2 text-xs text-subtle">
        Last {email.windowDays} days. Deliverability: {Math.round(email.deliveryRate * 100)}% (delivered vs bounced).
        Open/click/bounce data populates once the Resend webhook is configured.
      </p>
    </>
  )
}

function KpiSkeleton({ n }: { n: number }) {
  return (
    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4" aria-hidden>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-elevated/70" />
      ))}
    </div>
  )
}
