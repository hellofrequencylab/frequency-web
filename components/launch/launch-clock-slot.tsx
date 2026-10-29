import { LaunchClockLive } from '@/components/launch/launch-clock-live'
import { loadClockMs } from '@/lib/launch/clock-io'

// THE LAUNCH CLOCK (the slot). The one line every launch page adds to show the clock: reads the time kept on the
// launch and hands it to the live clock. Renders nothing when the time cannot be read, so the page carries on without
// it. Server Component.
export async function LaunchClockSlot({ launchId, ownerId, stages, stagesDone, done, total }: { launchId: string; ownerId: string; stages: readonly string[]; stagesDone: number; done: number; total: number }) {
  const ms = await loadClockMs(launchId, ownerId)
  if (ms === null) return null
  return <LaunchClockLive initialActiveMs={ms} done={done} total={total} stages={stages} stagesDone={stagesDone} />
}
