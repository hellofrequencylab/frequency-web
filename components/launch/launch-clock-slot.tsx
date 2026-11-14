import { LaunchClockLive } from '@/components/launch/launch-clock-live'
import { getLaunchForOwner } from '@/lib/launch/store'
import { showWizardClock } from '@/lib/launch/wizard-resume'
import { loadClockMs } from '@/lib/launch/clock-io'

// THE LAUNCH CLOCK (the slot). The one line every launch page adds to show the clock: reads the time kept on the
// launch and hands it to the live clock. Renders nothing when the time cannot be read, so the page carries on without
// it. Server Component.
export async function LaunchClockSlot({ launchId, ownerId, stages, stagesDone, done, total }: { launchId: string; ownerId: string; stages: readonly string[]; stagesDone: number; done: number; total: number }) {
  const launch = await getLaunchForOwner(ownerId, launchId)
  if (!launch?.resume?.timedEntry) return null
  const ms = await loadClockMs(launchId, ownerId)
  if (ms === null || !showWizardClock(launch.resume, ms)) return null
  return <LaunchClockLive initialActiveMs={ms} done={done} total={total} stages={stages} stagesDone={stagesDone} />
}
