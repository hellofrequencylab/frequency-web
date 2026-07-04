// Client-side write-through helpers for the server-authoritative active timer session
// (ADR-521). Fire-and-forget wrappers around the owner-gated server actions: the SAME
// lifecycle points that call saveLiveSession / clearLiveSession also push / clear the
// server row, so a running timer resumes cross-device. localStorage stays the fast
// same-browser cache; these never block the clock and never throw (a failed write just
// means "no server row" — the localStorage cache still recovers same-browser).

import {
  startTimerSession,
  pauseTimerSession,
  resumeTimerSession,
  cancelTimerSession,
  type StartTimerSessionInput,
} from '@/app/(main)/on-air/timer-session-actions'

/** Open or replace the server active session (on start / begin / any clock-shifting move). */
export function pushActiveSession(input: StartTimerSessionInput): void {
  void startTimerSession(input).catch(() => {})
}

/** Mark the server active session paused at the given epoch ms. */
export function pauseActiveSession(pausedAt: number): void {
  void pauseTimerSession(pausedAt).catch(() => {})
}

/** Resume the server active session with the pause-adjusted startedAt (epoch ms). */
export function resumeActiveSession(startedAt: number): void {
  void resumeTimerSession(startedAt).catch(() => {})
}

/** Drop the server active session (finish / leave / discard / cancel). */
export function clearActiveSession(): void {
  void cancelTimerSession().catch(() => {})
}
