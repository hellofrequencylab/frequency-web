import { getPracticeMetrics } from '@/lib/analytics/practice'
import { getEmailStats, getStudioCounts } from '@/lib/studio/analytics'

export const dynamic = 'force-dynamic'

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm p-4">
      <p className="text-xs text-muted font-medium">{label}</p>
      <p className="text-2xl font-bold text-text leading-none mt-1">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {hint && <p className="text-[11px] text-subtle mt-1">{hint}</p>}
    </div>
  )
}

const EMAIL_TYPES = ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained'] as const

export default async function AnalyticsPage() {
  const [practice, email, counts] = await Promise.all([
    getPracticeMetrics(),
    getEmailStats(30),
    getStudioCounts(),
  ])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-text mb-1">Analytics</h1>
        <p className="text-sm text-muted">Read-models off the one event backbone + the email log.</p>
      </div>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-subtle mb-2">North Star · Verified practice</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Weekly Active Members" value={practice.wam} />
          <Stat label="Practices this week" value={practice.verifiedThisWeek} />
          <Stat label="Activation 7d" value={`${Math.round(practice.activationRate * 100)}%`} hint={`${practice.activated}/${practice.newMembers} new members`} />
          <Stat label="New members 30d" value={practice.newMembers} />
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-subtle mb-2">CRM</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Contacts" value={counts.contacts} />
          <Stat label="Campaigns" value={counts.campaigns} />
          <Stat label="Suppressed" value={email.suppressed} hint="hard bounce / complaint" />
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-subtle mb-2">Email · last {email.windowDays} days</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {EMAIL_TYPES.map((t) => (
            <Stat key={t} label={t[0].toUpperCase() + t.slice(1)} value={email.byType[t] ?? 0} />
          ))}
        </div>
        <p className="text-xs text-subtle mt-2">
          Deliverability: {Math.round(email.deliveryRate * 100)}% (delivered vs bounced).
          Open/click/bounce data populates once the Resend webhook is configured.
        </p>
      </section>
    </div>
  )
}
