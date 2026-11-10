// The one AudioContext unlocked on the door's Go tap (LIVE-2244). Autoplay policy only opens
// audio inside a gesture, and since the door auto-starts both engines from an effect (no tap
// of their own), the engines seed their context from here. Lives at module scope on purpose:
// the door and the engine are different components mounted at different moments.
let unlocked: AudioContext | null = null

/** Create and resume the shared context. Call from a click handler; never throws. */
export function unlockTimerAudio(): void {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return
  try {
    unlocked = unlocked ?? new AudioContext()
    void unlocked.resume()
  } catch {
    // audio is a nicety, never a blocker
  }
}

/** The context the door unlocked, if any. An engine uses it before creating its own. */
export function takeUnlockedAudio(): AudioContext | null {
  return unlocked
}
