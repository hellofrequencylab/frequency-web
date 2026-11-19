// THE FEATURE BUILDER CLOCK (LIVE-2481): the light challenge on every builder. It starts on the first keystroke,
// stops at the finish, and lives in the visitor's own browser so a reload does not reset it. It never shames: past the
// budget it counts bonus time and says "Keep going". The pure half (clockView) is unit tested; the storage half reads
// and writes sessionStorage and falls back to memory when storage is blocked.

import { formatClock } from '@/lib/launch/clock'
import type { FeatureId } from './catalog'

export interface ClockState {
  startedAt: number | null
  endedAt: number | null
}

export interface ClockView {
  state: 'ready' | 'running' | 'bonus' | 'done'
  /** m:ss left while running, +m:ss in bonus time, the finish time when done. */
  label: string
  /** One or two words under the label. */
  caption: string
  /** 0 to 1, how much of the budget is used (the ring). */
  used: number
  elapsedMs: number
  aria: string
}

export function clockView(c: ClockState, now: number, budgetMs: number): ClockView {
  if (c.startedAt === null) return { state: 'ready', label: formatClock(budgetMs), caption: 'Starts when you type', used: 0, elapsedMs: 0, aria: `A ${Math.round(budgetMs / 60000)} minute challenge. It starts when you type.` }
  const end = c.endedAt ?? now
  const elapsed = Math.max(0, end - c.startedAt)
  if (c.endedAt !== null) {
    const beat = elapsed <= budgetMs
    return { state: 'done', label: formatClock(elapsed), caption: beat ? 'Beat the clock' : 'Done', used: Math.min(1, elapsed / budgetMs), elapsedMs: elapsed, aria: `Finished in ${formatClock(elapsed)}.` }
  }
  if (elapsed > budgetMs) return { state: 'bonus', label: `+${formatClock(elapsed - budgetMs)}`, caption: 'Bonus time. Keep going', used: 1, elapsedMs: elapsed, aria: 'Past the clock. Keep going.' }
  return { state: 'running', label: formatClock(budgetMs - elapsed), caption: 'Left on the clock', used: elapsed / budgetMs, elapsedMs: elapsed, aria: `${formatClock(budgetMs - elapsed)} left.` }
}

const key = (f: FeatureId) => `fq-fb-clock-${f}`
const memory = new Map<FeatureId, ClockState>()

function save(f: FeatureId, c: ClockState): ClockState {
  memory.set(f, c)
  try { window.sessionStorage.setItem(key(f), JSON.stringify(c)) } catch { /* memory keeps it for this visit */ }
  return c
}

export function readClock(f: FeatureId): ClockState {
  try {
    const raw = window.sessionStorage.getItem(key(f))
    if (raw) {
      const v = JSON.parse(raw) as Partial<ClockState>
      const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null)
      return { startedAt: n(v.startedAt), endedAt: n(v.endedAt) }
    }
  } catch { /* fall through */ }
  return memory.get(f) ?? { startedAt: null, endedAt: null }
}

export function startClock(f: FeatureId): ClockState {
  const c = readClock(f)
  return c.startedAt !== null && c.endedAt === null ? c : save(f, { startedAt: Date.now(), endedAt: null })
}

export function stopClock(f: FeatureId): ClockState {
  const c = readClock(f)
  return c.startedAt !== null && c.endedAt === null ? save(f, { startedAt: c.startedAt, endedAt: Date.now() }) : c
}
