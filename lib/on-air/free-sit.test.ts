import { describe, it, expect } from 'vitest'
import { findFreeSit, shouldRunFreeSit } from '@/lib/on-air/free-sit'
import type { OnAirPractice } from '@/components/on-air/session'

// Bug 3 regression (ADR-566 follow-up): the Be Still side must ALWAYS offer a Begin. When the
// resolved practice is log-only (timer_kind 'none'), picking a timed mode runs the Free Practice
// fallback instead of dead-ending on Just Log. These pure helpers encode that decision.

const logOnly: OnAirPractice = {
  id: 'log-only',
  title: 'Gratitude note',
  loggedToday: false,
  timerKind: 'none',
}

const timed: OnAirPractice = {
  id: 'sit-1',
  title: 'Morning Stillness',
  loggedToday: false,
  timerKind: 'mindless',
  durationMin: 10,
}

// The open-length Free Practice the loader appends: the only entry that maps to another log via
// logsAs and still routes to a timer.
const freePractice: OnAirPractice = {
  id: '__free_sit__',
  title: 'Free Practice',
  loggedToday: false,
  timerKind: 'mindless',
  logsAs: 'default-sit',
  durationMin: null,
}

describe('findFreeSit', () => {
  it('finds the Free Practice fallback in a list', () => {
    expect(findFreeSit([logOnly, timed, freePractice])?.id).toBe('__free_sit__')
  })

  it('returns undefined when no Free Practice is present', () => {
    expect(findFreeSit([logOnly, timed])).toBeUndefined()
  })

  it('does not mistake a log-only practice for the fallback (it has no logsAs)', () => {
    expect(findFreeSit([logOnly])).toBeUndefined()
  })

  it('ignores a logsAs entry that is itself log-only (never runnable)', () => {
    const weird: OnAirPractice = { ...freePractice, timerKind: 'none' }
    expect(findFreeSit([weird])).toBeUndefined()
  })
})

describe('shouldRunFreeSit', () => {
  it('runs Free Practice when a log-only default meets a timed mode + a fallback exists', () => {
    expect(shouldRunFreeSit('timer', false, freePractice)).toBe(true)
    expect(shouldRunFreeSit('breath', false, freePractice)).toBe(true)
    expect(shouldRunFreeSit('stillness', false, freePractice)).toBe(true)
  })

  it('keeps Just Log on the resolved (log-only) practice, never the fallback', () => {
    expect(shouldRunFreeSit('log', false, freePractice)).toBe(false)
  })

  it('does not run the fallback when the resolved practice can already time', () => {
    expect(shouldRunFreeSit('timer', true, freePractice)).toBe(false)
  })

  it('cannot run the fallback when none exists (truly log-only)', () => {
    expect(shouldRunFreeSit('timer', false, undefined)).toBe(false)
  })
})
