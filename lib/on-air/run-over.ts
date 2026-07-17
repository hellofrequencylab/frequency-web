// Run-over confirmation gate for the live On Air timers (Be Still + Get Moving).
//
// WHY THIS EXISTS: a live timer left running logs WALL-CLOCK time, not real practice.
// A ~5 min sit left open once banked 45 min; a session resumed overnight banked hours.
// The elapsed clock is honest, but an UNATTENDED run should not inflate logged airtime
// or streaks. So once a run passes a generous overage line we ask the member to confirm
// they are still practicing, and only time they CONFIRM (or the set target) is banked.
//
// This module is the PURE core — given a target, the elapsed airtime, and the confirmations
// the member made, it says exactly how many seconds to log, and where the next checkpoint /
// abandonment deadline fall. No React, no clock, no window: the timer IO (session.tsx /
// movement-session.tsx) drives it. Everything is in whole seconds of real (paused-adjusted)
// airtime measured from the run's own start.

/** Overage begins here: a run is "over" once its elapsed airtime passes this multiple of
 *  the set target (1.5x = 150%). At or under it, the happy path logs actual airtime. */
export const OVERAGE_THRESHOLD_RATIO = 1.5

/** The re-confirm interval floor / ceiling (seconds). The interval is the target length,
 *  clamped to this band: a short 2 min target still re-confirms every 5 min; a long 60 min
 *  target re-confirms every 15 min, never more often. */
export const RECONFIRM_MIN_INTERVAL_SEC = 5 * 60 // 300
export const RECONFIRM_MAX_INTERVAL_SEC = 15 * 60 // 900

/** The re-confirm / abandonment interval for a target: the target length, clamped to
 *  [RECONFIRM_MIN_INTERVAL_SEC, RECONFIRM_MAX_INTERVAL_SEC]. */
export function reconfirmIntervalSec(targetSec: number): number {
  const t = Math.max(0, Math.round(targetSec))
  return Math.min(RECONFIRM_MAX_INTERVAL_SEC, Math.max(RECONFIRM_MIN_INTERVAL_SEC, t))
}

/** The elapsed airtime (seconds) at which the FIRST run-over checkpoint prompts. */
export function overageThresholdSec(targetSec: number): number {
  return Math.round(Math.max(0, targetSec) * OVERAGE_THRESHOLD_RATIO)
}

/** The next checkpoint's elapsed offset (seconds), given the confirmations made so far.
 *  No confirmation yet -> the first threshold (1.5x target); otherwise one interval past
 *  the last confirmed point. */
export function nextCheckpointSec(targetSec: number, confirmedAtSec: number[] = []): number {
  const last = confirmedAtSec.length ? Math.max(...confirmedAtSec) : null
  if (last === null) return overageThresholdSec(targetSec)
  return Math.round(last + reconfirmIntervalSec(targetSec))
}

export type RunOverPhase = 'clear' | 'prompting' | 'abandoned'

export interface RunOverState {
  /** 'clear' — under the current checkpoint, log actual airtime, no prompt.
   *  'prompting' — past a checkpoint, still within its interval: show the confirm prompt,
   *    keep running. 'abandoned' — the checkpoint went a whole interval unanswered: the
   *    member walked away; auto-finalize at the last confirmed point (or target). */
  phase: RunOverPhase
  /** Elapsed (seconds) at which the current/next checkpoint prompts. */
  checkpointAtSec: number
  /** Elapsed (seconds) past which an unanswered checkpoint auto-finalizes. */
  deadlineSec: number
}

/** Classify the run-over state at a given airtime elapsed. PURE. Only a run with a real
 *  target (targetSec > 0) is ever gated; an open-ended / zero target is always 'clear'
 *  (nothing to measure 150% against — those runs count up by design). */
export function runOverStateAt(
  targetSec: number,
  elapsedSec: number,
  confirmedAtSec: number[] = [],
): RunOverState {
  const checkpoint = nextCheckpointSec(targetSec, confirmedAtSec)
  const deadline = Math.round(checkpoint + reconfirmIntervalSec(targetSec))
  let phase: RunOverPhase = 'clear'
  if (Math.round(targetSec) > 0 && elapsedSec >= checkpoint) {
    phase = elapsedSec >= deadline ? 'abandoned' : 'prompting'
  }
  return { phase, checkpointAtSec: checkpoint, deadlineSec: deadline }
}

/** THE CLAMP. The seconds to LOG for a run, given its set target, the total airtime
 *  elapsed, and the confirmations the member made past the first checkpoint. PURE.
 *
 *  - At or under 150% of target: log the actual airtime (happy path, no gate).
 *  - Over 150% with NO confirmation: log exactly the target (never the unattended run-over).
 *  - Over 150% with confirmations: log up to the LAST confirmed checkpoint, floored at the
 *    target. Never logs beyond the last confirmed point, and never beyond actual elapsed.
 *
 *  A present member's manual Finish counts as a confirmation of NOW: the caller appends the
 *  current elapsed to `confirmedAtSec`, so a present finish logs actual airtime. The gate's
 *  teeth are the auto-finalize / resume-return paths, which pass only the real confirmations. */
export function clampLoggedSeconds(
  targetSec: number,
  elapsedSec: number,
  confirmedAtSec: number[] = [],
): number {
  const elapsed = Math.max(0, Math.round(elapsedSec))
  const target = Math.max(0, Math.round(targetSec))
  // No real target (open-ended) never clamps — there is nothing to measure 150% against.
  if (target <= 0) return elapsed
  const threshold = overageThresholdSec(target)
  if (elapsed <= threshold) return elapsed
  // Over threshold: the confirmed ceiling, floored at the target, never past actual elapsed.
  const lastConfirmed = confirmedAtSec.length
    ? Math.min(elapsed, Math.round(Math.max(...confirmedAtSec)))
    : 0
  return Math.min(elapsed, Math.max(target, lastConfirmed))
}
