import { getEmailStats } from '@/lib/studio/analytics'
import { AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'

const EMAIL_TYPES = ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained'] as const

// Marketing analytics layout module (ADR-270/294): the email log at a glance — sent, delivered,
// opened, clicked, bounced, and complained over the last 30 days, plus the deliverability line.
// Self-fetching RSC; always renders (the counts are the signal even at zero).
export async function MarketingAnalyticsEmail() {
  const email = await getEmailStats(30)

  return (
    <AdminSection title="Email">
      <div className="grid grid-cols-2 gap-3.5 @xl:grid-cols-3 @4xl:grid-cols-6">
        {EMAIL_TYPES.map((t) => (
          <StatCard key={t} label={t[0].toUpperCase() + t.slice(1)} value={(email.byType[t] ?? 0).toLocaleString()} />
        ))}
      </div>
      <p className="mt-2 text-xs text-subtle">
        Last {email.windowDays} days. Deliverability: {Math.round(email.deliveryRate * 100)}% (delivered vs bounced).
        Open/click/bounce data populates once the Resend webhook is configured.
      </p>
    </AdminSection>
  )
}
