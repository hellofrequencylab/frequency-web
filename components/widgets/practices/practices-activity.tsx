import { Flame } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { getMemberPractices, getRecentPracticeLogs } from '@/lib/practices'
import { SectionHeader } from '@/components/ui/section-header'

// Practices layout module (ADR-270/294): "Your activity" — a 14-day log heatmap for the signed-in
// member. Self-fetching RSC; renders nothing for a logged-out viewer or one with no practices and
// no logs yet (matching the page's prior gate). Keeps the id="practices-activity" anchor.
export async function PracticesActivity() {
  const profileId = await getMyProfileId()
  if (!profileId) return null

  const [mine, recent] = await Promise.all([
    getMemberPractices(profileId),
    getRecentPracticeLogs(profileId, 60),
  ])
  if (recent.length === 0 && mine.length === 0) return null

  const loggedDays = new Set(recent.map((r) => r.logged_for))
  const today = new Date()
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (13 - i))
    return d.toISOString().slice(0, 10)
  })
  const daysLogged = last14.filter((d) => loggedDays.has(d)).length

  return (
    <section id="practices-activity" className="max-w-2xl scroll-mt-20">
      <SectionHeader title="Your activity" />
      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm text-muted">
            <Flame className="h-4 w-4 text-primary" />Last 14 days
          </span>
          <span className="text-sm font-semibold text-text">
            {daysLogged} {daysLogged === 1 ? 'day' : 'days'} practiced
          </span>
        </div>
        <div className="flex gap-1.5">
          {last14.map((d) => (
            <div
              key={d}
              title={d}
              className={`h-7 flex-1 rounded-lg ${loggedDays.has(d) ? 'bg-primary' : 'border border-border bg-surface'}`}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
