import { describe, it, expect } from 'vitest'
import {
  clampLoggedSeconds,
  runOverStateAt,
  reconfirmIntervalSec,
  overageThresholdSec,
  nextCheckpointSec,
  OVERAGE_THRESHOLD_RATIO,
  RECONFIRM_MIN_INTERVAL_SEC,
  RECONFIRM_MAX_INTERVAL_SEC,
} from './run-over'

const MIN = 60

describe('reconfirmIntervalSec', () => {
  it('clamps a short target up to the 5 min floor', () => {
    expect(reconfirmIntervalSec(2 * MIN)).toBe(RECONFIRM_MIN_INTERVAL_SEC) // 2 min -> 5 min
    expect(reconfirmIntervalSec(0)).toBe(RECONFIRM_MIN_INTERVAL_SEC)
  })
  it('clamps a long target down to the 15 min ceiling', () => {
    expect(reconfirmIntervalSec(60 * MIN)).toBe(RECONFIRM_MAX_INTERVAL_SEC) // 60 min -> 15 min
  })
  it('uses the target length within the band', () => {
    expect(reconfirmIntervalSec(10 * MIN)).toBe(10 * MIN)
  })
})

describe('overageThresholdSec / nextCheckpointSec', () => {
  it('the first checkpoint is 150% of target', () => {
    expect(overageThresholdSec(5 * MIN)).toBe(Math.round(5 * MIN * OVERAGE_THRESHOLD_RATIO)) // 7.5 min
    expect(nextCheckpointSec(5 * MIN, [])).toBe(overageThresholdSec(5 * MIN))
  })
  it('after a confirm, the next checkpoint is one interval later', () => {
    // 5 min target -> interval 5 min. Confirm at 8 min -> next at 13 min.
    expect(nextCheckpointSec(5 * MIN, [8 * MIN])).toBe(8 * MIN + RECONFIRM_MIN_INTERVAL_SEC)
  })
  it('reads the LAST confirmation when several exist', () => {
    expect(nextCheckpointSec(5 * MIN, [8 * MIN, 13 * MIN])).toBe(13 * MIN + RECONFIRM_MIN_INTERVAL_SEC)
  })
})

describe('runOverStateAt', () => {
  const target = 5 * MIN // threshold 7.5 min, interval 5 min, deadline 12.5 min
  it('is clear under the threshold', () => {
    expect(runOverStateAt(target, 6 * MIN, []).phase).toBe('clear')
  })
  it('prompts between the checkpoint and its deadline', () => {
    expect(runOverStateAt(target, 8 * MIN, []).phase).toBe('prompting')
  })
  it('is abandoned once a checkpoint is a whole interval unanswered', () => {
    expect(runOverStateAt(target, 13 * MIN, []).phase).toBe('abandoned')
  })
  it('a confirm pushes the prompt + deadline out by one interval', () => {
    // Confirmed at 8 min: next checkpoint 13 min, deadline 18 min. At 13.5 min -> prompting again.
    const st = runOverStateAt(target, 13.5 * MIN, [8 * MIN])
    expect(st.phase).toBe('prompting')
    expect(st.checkpointAtSec).toBe(13 * MIN)
    expect(st.deadlineSec).toBe(18 * MIN)
  })
  it('never gates an open-ended (zero target) run', () => {
    expect(runOverStateAt(0, 10 * 60 * MIN, []).phase).toBe('clear')
  })
})

describe('clampLoggedSeconds', () => {
  const target = 5 * MIN // threshold 7.5 min

  it('under threshold logs actual airtime (happy path)', () => {
    expect(clampLoggedSeconds(target, 5 * MIN, [])).toBe(5 * MIN)
    expect(clampLoggedSeconds(target, 7 * MIN, [])).toBe(7 * MIN) // still <= 7.5 min
  })

  it('over threshold with no confirmation logs exactly the target', () => {
    expect(clampLoggedSeconds(target, 45 * MIN, [])).toBe(target)
  })

  it('the overnight case (no confirms, hours elapsed) logs the target, not the wall clock', () => {
    expect(clampLoggedSeconds(target, 8 * 60 * MIN, [])).toBe(target)
  })

  it('one confirm then abandon logs up to that confirm (floored at target)', () => {
    // Confirmed at 9 min, then ran away to 45 min: log 9 min, never the 45.
    expect(clampLoggedSeconds(target, 45 * MIN, [9 * MIN])).toBe(9 * MIN)
  })

  it('multiple confirms log up to the LAST confirmed point', () => {
    expect(clampLoggedSeconds(target, 60 * MIN, [9 * MIN, 14 * MIN, 19 * MIN])).toBe(19 * MIN)
  })

  it('a present finish (elapsed appended as a confirmation) logs actual airtime', () => {
    const elapsed = 45 * MIN
    expect(clampLoggedSeconds(target, elapsed, [9 * MIN, elapsed])).toBe(elapsed)
  })

  it('never logs beyond actual elapsed even if a confirmation is out of range', () => {
    expect(clampLoggedSeconds(target, 20 * MIN, [999 * MIN])).toBe(20 * MIN)
  })

  it('floors at the target when the last confirm is below it', () => {
    // A confirmation below target should never drag the log under the target floor.
    expect(clampLoggedSeconds(target, 45 * MIN, [1 * MIN])).toBe(target)
  })

  it('open-ended (zero target) logs actual, never clamps', () => {
    expect(clampLoggedSeconds(0, 90 * MIN, [])).toBe(90 * MIN)
  })

  it('resume path: banked handled by the caller; the clamp measures this session only', () => {
    // A resumed top-up session with its own remaining-time target behaves the same.
    const remainingTarget = 3 * MIN // threshold 4.5 min
    expect(clampLoggedSeconds(remainingTarget, 40 * MIN, [])).toBe(remainingTarget)
    expect(clampLoggedSeconds(remainingTarget, 4 * MIN, [])).toBe(4 * MIN)
  })
})
