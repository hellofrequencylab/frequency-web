import { describe, expect, it } from 'vitest'
import { hideAskIsFresh, readSetupHidden, SETUP_HIDDEN_KEY, SETUP_HIDE_ASKED_KEY } from './setup-hidden'

const now = new Date('2026-10-29T12:00:00Z')
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()

describe('readSetupHidden', () => {
  it('is true only for an explicit true', () => {
    expect(readSetupHidden({ [SETUP_HIDDEN_KEY]: true })).toBe(true)
    for (const v of [false, 'true', 1, null, undefined]) expect(readSetupHidden({ [SETUP_HIDDEN_KEY]: v })).toBe(false)
  })
  it('reads junk meta as not hidden', () => {
    for (const m of [null, undefined, 'x', 5, [], {}]) expect(readSetupHidden(m)).toBe(false)
  })
})

describe('hideAskIsFresh', () => {
  it('accepts a first step taken in the last ten minutes', () => {
    expect(hideAskIsFresh({ [SETUP_HIDE_ASKED_KEY]: ago(1000) }, now)).toBe(true)
    expect(hideAskIsFresh({ [SETUP_HIDE_ASKED_KEY]: ago(10 * 60 * 1000) }, now)).toBe(true)
  })
  it('refuses a stale, future, missing or junk stamp', () => {
    expect(hideAskIsFresh({ [SETUP_HIDE_ASKED_KEY]: ago(10 * 60 * 1000 + 1) }, now)).toBe(false)
    expect(hideAskIsFresh({ [SETUP_HIDE_ASKED_KEY]: ago(-5000) }, now)).toBe(false)
    for (const m of [{}, null, { [SETUP_HIDE_ASKED_KEY]: 'soon' }, { [SETUP_HIDE_ASKED_KEY]: null }]) expect(hideAskIsFresh(m, now)).toBe(false)
  })
})
