// Crash-safe persistence for a RUNNING timer (the Mindless sit + the Movement timer).
//
// Why this exists: both live timers (components/on-air/session.tsx, movement-session.tsx)
// hold their entire running state — startedAt, pausedAt, the chosen mode/config — in React
// memory only. Mobile browsers freeze a backgrounded tab and then DISCARD it to reclaim RAM
// (a long stint in a pocket with the screen off). On reopen the page reloads from scratch, the
// React tree is gone, and the run resets to the setup screen — the member loses the sit.
//
// The fix: write a tiny record to localStorage on start / pause / resume (and a heartbeat while
// running), so a reload can DETECT an in-progress run and offer to resume it. The clock is already
// wall-clock based (Date.now() - startedAt), so the exact elapsed time is recovered from the saved
// startedAt — no time is lost to the freeze. The per-surface `setup` payload (an opaque shape each
// surface owns) carries everything needed to rebuild the mode/config and continue.
//
// Pure where it can be (parseRecord / liveElapsedSeconds take an explicit `now`, no window), so the
// staleness + elapsed logic is unit-tested; the load/save/clear wrappers are thin guards around
// localStorage. Best-effort throughout: any read/parse/quota failure degrades to "no saved run",
// never throws into a render.

export type LiveTimerKind = 'mindless' | 'movement'

export interface LiveSessionRecord<TSetup = unknown> {
  kind: LiveTimerKind
  /** Wall-clock start, epoch ms. Pause-adjusted: each resume shifts it forward by the paused span,
   *  so (now - startedAt) is always the real elapsed airtime. */
  startedAt: number
  /** Epoch ms the member paused, or null while running. */
  pausedAt: number | null
  /** The practice this run logs against (completeSession's practiceId). */
  practiceId: string
  /** Seconds already banked by an earlier partial (a "Finish Practice" resume); 0 for a fresh run. */
  resumeFromSec: number
  /** The practice's full target length in seconds, or null for an open-ended run (Play / Free sit). */
  secondsTarget: number | null
  /** Epoch ms this record was last written — the liveness stamp the staleness guard reads. */
  savedAt: number
  /** Per-surface payload to rebuild the mode + config on resume (each surface owns its shape). */
  setup: TSetup
}

// A run older than this since its last heartbeat is treated as abandoned and dropped, so a sit left
// overnight never resurrects. Generous enough for a real long walk/run plus time in a pocket.
export const LIVE_SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000

function storageKey(kind: LiveTimerKind): string {
  return `fq_live_session_${kind}`
}

/** Real elapsed airtime for a record, in whole seconds. Paused runs freeze at the pause moment. */
export function liveElapsedSeconds(
  rec: Pick<LiveSessionRecord, 'startedAt' | 'pausedAt'>,
  now: number = Date.now(),
): number {
  const end = rec.pausedAt ?? now
  return Math.max(0, Math.round((end - rec.startedAt) / 1000))
}

function isLiveSessionRecord(v: unknown): v is LiveSessionRecord {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return (
    (r.kind === 'mindless' || r.kind === 'movement') &&
    typeof r.startedAt === 'number' &&
    (r.pausedAt === null || typeof r.pausedAt === 'number') &&
    typeof r.practiceId === 'string' &&
    typeof r.resumeFromSec === 'number' &&
    (r.secondsTarget === null || typeof r.secondsTarget === 'number') &&
    typeof r.savedAt === 'number' &&
    'setup' in r
  )
}

/** Parse a stored record, validating shape and staleness. PURE (takes `now`): returns null for
 *  missing, malformed, or stale (older than LIVE_SESSION_MAX_AGE_MS since last heartbeat) input. */
export function parseRecord<TSetup = unknown>(
  raw: string | null,
  now: number = Date.now(),
): LiveSessionRecord<TSetup> | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isLiveSessionRecord(parsed)) return null
  if (now - parsed.savedAt > LIVE_SESSION_MAX_AGE_MS) return null
  return parsed as LiveSessionRecord<TSetup>
}

/** Persist (or refresh) the running session. Stamps savedAt now. Best-effort. */
export function saveLiveSession<TSetup>(rec: Omit<LiveSessionRecord<TSetup>, 'savedAt'>): void {
  if (typeof window === 'undefined') return
  try {
    const full: LiveSessionRecord<TSetup> = { ...rec, savedAt: Date.now() }
    window.localStorage.setItem(storageKey(rec.kind), JSON.stringify(full))
  } catch {
    // localStorage may be full or blocked (private mode); persistence is a safety net, never a blocker.
  }
}

/** Read the saved run for a surface, dropping it if missing, malformed, or stale. */
export function loadLiveSession<TSetup = unknown>(
  kind: LiveTimerKind,
  now: number = Date.now(),
): LiveSessionRecord<TSetup> | null {
  if (typeof window === 'undefined') return null
  let raw: string | null
  try {
    raw = window.localStorage.getItem(storageKey(kind))
  } catch {
    return null
  }
  const rec = parseRecord<TSetup>(raw, now)
  // A present-but-unusable record (stale / malformed) is swept so it never lingers.
  if (!rec && raw) clearLiveSession(kind)
  return rec
}

/** Forget the saved run (on finish, discard, or recovery cleanup). Best-effort. */
export function clearLiveSession(kind: LiveTimerKind): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(storageKey(kind))
  } catch {
    // ignore
  }
}
