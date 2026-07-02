import { getPracticeMetrics } from '@/lib/analytics/practice'
import { AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { FreshnessNote } from '@/components/admin/freshness-note'

// Marketing analytics layout module (ADR-270/294): the North Star band — the verified-practice
// read-model off the one event backbone (weekly active members, practices this week, activation,
// new members). Self-fetching RSC. A stat band always renders (the counts are the signal even at
// zero), so it doesn't null out; it's isolated in its own <Suspense> by the renderer so a slow
// read never blocks the page.
export async function MarketingAnalyticsNorthStar() {
  const practice = await getPracticeMetrics()

  return (
    <AdminSection title="North Star · Verified practice" actions={<FreshnessNote at={new Date()} />}>
      <div className="grid grid-cols-2 gap-3.5 @2xl:grid-cols-4">
        <StatCard label="Weekly Active Members" value={practice.wam.toLocaleString()} />
        <StatCard label="Practices this week" value={practice.verifiedThisWeek.toLocaleString()} />
        <StatCard label="Activation 7d" value={`${Math.round(practice.activationRate * 100)}%`} />
        <StatCard label="New members 30d" value={practice.newMembers.toLocaleString()} />
      </div>
    </AdminSection>
  )
}
