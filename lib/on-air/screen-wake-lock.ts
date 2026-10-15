// Mobile browsers release a screen wake lock when hidden. The sentinel remains an object:
// availability must inspect `released`, not merely whether that object exists.
export interface ScreenWakeLockHandle {
  readonly released: boolean
  release(): Promise<void>
}

type RequestLock = () => Promise<ScreenWakeLockHandle | null>

/** One lock per timer, including overlapping Start/visibility requests and late unmounts. */
export function createScreenWakeLock(request: RequestLock = async () => {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return null
  return navigator.wakeLock.request('screen')
}) {
  let current: ScreenWakeLockHandle | null = null
  let pending: Promise<void> | null = null
  let generation = 0

  function acquire(): Promise<void> {
    if (current && !current.released) return Promise.resolve()
    if (pending) return pending
    const requestedGeneration = generation
    const task = (async () => {
      try {
        const lock = await request()
        if (requestedGeneration !== generation) {
          await lock?.release()
          return
        }
        current = lock
      } catch {
        // Unsupported/power-saving/permission rejection never stops the timer.
      }
    })()
    pending = task
    void task.finally(() => { if (pending === task) pending = null })
    return task
  }

  async function release(): Promise<void> {
    generation += 1
    const lock = current
    current = null
    pending = null
    try {
      await lock?.release()
    } catch {
      // The OS may have released it already.
    }
  }

  return { acquire, release }
}
