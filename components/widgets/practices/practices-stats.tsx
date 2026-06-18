import { getMyProfileId } from '@/lib/auth'
import {
  countPublicPractices,
  getMemberPractices,
  getRecentPracticeLogs,
} from '@/lib/practices'
import { getPracticeStreak } from '@/lib/practice-streak'
import { demoModeEnabled } from '@/lib/platform-flags'
import { viewerHidesDemo } from '@/lib/demo-preference'
import { StatCard } from '@/components/ui/stat-card'

// Practices layout module (ADR-270/294): the headline stat band — your practices, days
// practiced over the last 14, the current + longest streak, and the public library size.
// Self-fetching RSC; the personal hrefs anchor to the sibling blocks (preserved ids) and the
// fixed library section the page still renders. A logged-out viewer sees only the library tile
// (the personal stats degrade away gracefully — no zeros to a stranger).
export async function PracticesStats() {
  const profileId = await getMyProfileId()
  const hideDemo = !(await demoModeEnabled()) || (await viewerHidesDemo())

  const [mine, recent, streak, libraryTotal] = await Promise.all([
    profileId ? getMemberPractices(profileId) : Promise.resolve([]),
    profileId ? getRecentPracticeLogs(profileId, 60) : Promise.resolve([]),
    profileId ? getPracticeStreak(profileId) : Promise.resolve(null),
    countPublicPractices({ hideDemo }),
  ])

  // Days practiced across the last 14 (the activity block's old window).
  const loggedDays = new Set(recent.map((r) => r.logged_for))
  const today = new Date()
  const daysPracticed = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (13 - i))
    return d.toISOString().slice(0, 10)
  }).filter((d) => loggedDays.has(d)).length

  // The current-streak detail line names its state in the calm voice — logged today, keep it
  // alive, or a quiet zero. Never a shame line for a broken streak.
  const streakDetail = streak
    ? streak.loggedToday
      ? 'Logged today'
      : streak.atRisk
        ? 'Log today to keep it'
        : streak.resting
          ? 'Resting'
          : streak.current === 0
            ? 'Start one today'
            : undefined
    : undefined

  return (
    <div className="grid grid-cols-2 gap-2.5 @md:grid-cols-3 @3xl:grid-cols-5">
      {profileId && (
        <>
          <StatCard
            label="Your practices"
            value={mine.length}
            href="#practices-mine"
          />
          <StatCard
            label="Days practiced"
            value={daysPracticed}
            detail="last 14 days"
            href="#practices-activity"
          />
          <StatCard
            label="Current streak"
            value={streak ? `${streak.current} ${streak.current === 1 ? 'day' : 'days'}` : '0 days'}
            detail={streakDetail}
            href="#practices-activity"
          />
          <StatCard
            label="Longest streak"
            value={streak ? `${streak.longest} ${streak.longest === 1 ? 'day' : 'days'}` : '0 days'}
          />
        </>
      )}
      <StatCard
        label="In the library"
        value={libraryTotal}
        href="#practices-library"
      />
    </div>
  )
}
