import 'server-only'
import { listOperatedSpaces } from '@/lib/spaces/operated'
import { getSpaceById, loadRootSpaceId } from '@/lib/spaces/store'
import { listPlanPencilDays, listSpacePlans } from '@/lib/calendar/plans-store'
import { dayKeyIn } from '@/lib/calendar/day-grid-nav'
import { HOME_TZ } from '@/lib/time/home-zone'
import { listTasksWithShared } from '@/lib/calendar/shared-tasks'
import { buildWorkRollup, type WorkRollup, type WorkSpace } from './rollup-core'

// The read half of the Console Work rollup (LIVE-2534). The Spaces the viewer runs, plus the
// Frequency root Space, which listOperatedSpaces leaves out on purpose ("you can't run the
// platform") but which is where the Frequency team's own Plans live. This loader is only called
// behind the Console's staff gate, so adding the root Space here never widens who sees it.

/** More than this and the page would be a report, not a to-do list. */
const MAX_SPACES = 25

export async function loadWorkRollup(profileId: string): Promise<{ rollup: WorkRollup; spaces: WorkSpace[] }> {
  const [operated, rootId] = await Promise.all([listOperatedSpaces(profileId), loadRootSpaceId()])
  const spaces: WorkSpace[] = []
  if (rootId) {
    const root = await getSpaceById(rootId)
    if (root) spaces.push({ id: root.id, slug: root.slug, name: root.name })
  }
  for (const s of operated) {
    if (!spaces.some((x) => x.id === s.id)) spaces.push({ id: s.id, slug: s.slug, name: s.name })
  }
  const shown = spaces.slice(0, MAX_SPACES)
  const input = await Promise.all(
    shown.map(async (space) => {
      const [plans, tasks, pencilDays] = await Promise.all([
        listSpacePlans(space.id).catch(() => []),
        listTasksWithShared(space.id).catch(() => []),
        listPlanPencilDays(space.id, HOME_TZ).catch(() => ({})),
      ])
      return { space, plans, tasks, pencilDays, todayKey: dayKeyIn(HOME_TZ) }
    }),
  )
  return { rollup: buildWorkRollup(input, profileId), spaces: shown }
}
