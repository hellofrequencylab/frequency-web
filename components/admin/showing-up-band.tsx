import { getShowingUpReading, SHOWING_UP_WINDOW_DAYS } from '@/lib/analytics/showing-up'
import { AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { FreshnessNote } from '@/components/admin/freshness-note'

const WEEK_MS = SHOWING_UP_WINDOW_DAYS * 24 * 60 * 60 * 1000

// THE NORTH STAR BAND (LIVE-809, ADR-1720): weekly showing-up Members, this week beside last week so
// the trend reads at a glance. Fixed at the top of /admin/marketing/analytics rather than a movable
// module, because it is the one number the launch steers by. Self-fetching RSC.
export async function ShowingUpBand() {
  const now = new Date()
  const [thisWeek, lastWeek] = await Promise.all([
    getShowingUpReading(now),
    getShowingUpReading(new Date(now.getTime() - WEEK_MS)),
  ])
  const fmt = (n: number | undefined) => (n === undefined ? 'No reading' : n.toLocaleString())

  return (
    <AdminSection title="North Star · Showing up" actions={<FreshnessNote at={now} />}>
      <div className="grid grid-cols-2 gap-3.5 @2xl:grid-cols-4">
        <StatCard label="Showing-up Members, last 7 days" value={fmt(thisWeek?.members)} />
        <StatCard label="The 7 days before" value={fmt(lastWeek?.members)} />
        <StatCard label="Guests marked present, last 7 days" value={fmt(thisWeek?.guests)} />
      </div>
      <p className="mt-3 text-meta text-muted">
        Distinct people a Host marked present at a gathering. Self check-ins do not count.
      </p>
    </AdminSection>
  )
}
