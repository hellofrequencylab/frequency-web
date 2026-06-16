import { getMyProfileId } from '@/lib/auth'
import {
  countPublicPractices,
  getMemberPractices,
  getRecentPracticeLogs,
} from '@/lib/practices'
import { demoModeEnabled } from '@/lib/platform-flags'
import { viewerHidesDemo } from '@/lib/demo-preference'
import { StatStrip } from '@/components/ui/page-header'

// Practices layout module (ADR-270/294): the three-up headline strip — your practices, days
// logged in the last 14, and the public library size. Self-fetching RSC; the stat hrefs anchor
// to the sibling blocks (preserved ids) and the fixed library section the page still renders.
export async function PracticesStats() {
  const profileId = await getMyProfileId()
  const hideDemo = !(await demoModeEnabled()) || (await viewerHidesDemo())

  const [mine, recent, libraryTotal] = await Promise.all([
    profileId ? getMemberPractices(profileId) : Promise.resolve([]),
    profileId ? getRecentPracticeLogs(profileId, 60) : Promise.resolve([]),
    countPublicPractices({ hideDemo }),
  ])

  // Days practiced across the last 14 (the activity block's window).
  const loggedDays = new Set(recent.map((r) => r.logged_for))
  const today = new Date()
  const daysLogged = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (13 - i))
    return d.toISOString().slice(0, 10)
  }).filter((d) => loggedDays.has(d)).length

  return (
    <StatStrip
      items={[
        { value: mine.length, label: 'Your practices', href: '#practices-mine' },
        { value: daysLogged, label: 'Days logged (14d)', href: '#practices-activity' },
        { value: libraryTotal, label: 'In the library', href: '#practices-library' },
      ]}
    />
  )
}
