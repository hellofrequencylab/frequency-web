// Airwaves player — the pure core. No React, no DOM, no side effects: everything here is a plain
// function of its inputs, so the rate cycle, the time labels, and the storage keys are unit-tested
// in isolation (playback.test.ts) and the component just wires them up.

/** The speed selector's fixed steps (Airwaves plan §7b, item 6). 1x is the identity. */
export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const

export type PlaybackRate = (typeof PLAYBACK_RATES)[number]

export const DEFAULT_RATE: PlaybackRate = 1

/** localStorage key for the member's chosen speed — one value, carried across every Recording. */
export const RATE_STORAGE_KEY = 'airwaves:rate'

/** Prefix for the per-Recording resume position. */
export const POSITION_KEY_PREFIX = 'airwaves:pos:'

/** How often (ms) we persist the current position while playing. Throttled so we don't thrash. */
export const POSITION_WRITE_INTERVAL_MS = 5_000

/** The per-Recording resume-position storage key. Isolated + tested so a typo can't drift the key. */
export function positionKey(recordingId: string): string {
  return `${POSITION_KEY_PREFIX}${recordingId}`
}

/** Coerce any number to the nearest valid rate; unknown / junk falls back to 1x (safe for reads). */
export function clampRate(value: number): PlaybackRate {
  if (!Number.isFinite(value)) return DEFAULT_RATE
  let best: PlaybackRate = DEFAULT_RATE
  let bestGap = Infinity
  for (const rate of PLAYBACK_RATES) {
    const gap = Math.abs(rate - value)
    if (gap < bestGap) {
      bestGap = gap
      best = rate
    }
  }
  return best
}

/**
 * The next speed in the cycle. `dir` is +1 (faster) or -1 (slower); the list wraps, so tapping the
 * control past 3x returns to 0.5x. Snaps an off-list current value onto the list first.
 */
export function cycleRate(current: number, dir: 1 | -1 = 1): PlaybackRate {
  const snapped = clampRate(current)
  const i = PLAYBACK_RATES.indexOf(snapped)
  const len = PLAYBACK_RATES.length
  const next = (i + dir + len) % len
  return PLAYBACK_RATES[next]
}

/** The speed label, e.g. `1x`, `1.5x`, `0.75x`. */
export function formatRate(rate: number): string {
  return `${rate}x`
}

/**
 * A clock label from seconds: `m:ss`, or `h:mm:ss` past an hour. Guards NaN / negative / Infinity
 * (a media element reports NaN duration before metadata loads) to a stable `0:00`.
 */
export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0
  const whole = Math.floor(totalSeconds)
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const seconds = whole % 60
  const ss = String(seconds).padStart(2, '0')
  if (hours > 0) {
    const mm = String(minutes).padStart(2, '0')
    return `${hours}:${mm}:${ss}`
  }
  return `${minutes}:${ss}`
}

/** The remaining-time label, e.g. `-3:20`. Clamps so it never reads a positive remainder. */
export function formatRemaining(current: number, duration: number): string {
  const remaining = Number.isFinite(duration) ? Math.max(0, duration - current) : 0
  return `-${formatTime(remaining)}`
}

/** The resume affordance's plain label. */
export function describeResume(positionSec: number): string {
  return `Resume from ${formatTime(positionSec)}`
}

/**
 * The chapter active at `current`: the last chapter whose start is at or before now. Chapters may
 * arrive unsorted; we sort a copy. Returns the index, or -1 before the first chapter starts.
 */
export function activeChapterIndex(
  chapters: { startSec: number }[] | undefined,
  current: number,
): number {
  if (!chapters || chapters.length === 0) return -1
  const ordered = chapters
    .map((c, i) => ({ startSec: c.startSec, i }))
    .sort((a, b) => a.startSec - b.startSec)
  let activeOriginal = -1
  for (const c of ordered) {
    if (current + 0.001 >= c.startSec) activeOriginal = c.i
    else break
  }
  return activeOriginal
}
