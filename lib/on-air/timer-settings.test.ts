import { describe, expect, it } from 'vitest'
import {
  MINUTE_MAX,
  TIMER_SETTINGS_KEY,
  diffSettings,
  isValidMemberMinutes,
  prefsPatchFromSettings,
  readTimerSettings,
  sanitizePrefsPatch,
  settingsFromPrefs,
  writeTimerSettings,
} from './timer-settings'

function store(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init))
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), map: m }
}

describe('timer settings model (LIVE-2240)', () => {
  it('reads the server copy with product defaults for anything missing', () => {
    const s = settingsFromPrefs({})
    expect(s.still).toEqual({ patternSlug: 'box', minutes: 10, customIn: 4, customHold: 4, customOut: 6 })
    expect(s.move).toBeNull()
    expect(s.cues.bell).toBe(false)
    expect(s.cues.moveBell).toBe(true)
    expect(s.cues.warmupSec).toBe(5)
  })

  it('never remembers a 1-minute Just Log or an out-of-band length', () => {
    expect(settingsFromPrefs({ minutes: 0 }).still.minutes).toBe(10)
    expect(settingsFromPrefs({ minutes: 500 }).still.minutes).toBe(MINUTE_MAX)
    expect(isValidMemberMinutes(121)).toBe(false)
    expect(isValidMemberMinutes(1)).toBe(true)
  })

  it('folds the two legacy localStorage keys into the model once', () => {
    const st = store({
      fq_mindless_setup: JSON.stringify({ mode: 'breath', patternSlug: 'cohere', minutes: 15, customIn: 5 }),
      fq_movement_setup: JSON.stringify({ mode: 'strength', strengthKind: 'emom', workSec: 50, restSec: 10, rounds: 10 }),
    })
    const s = readTimerSettings(settingsFromPrefs({}), st)
    expect(s.still.patternSlug).toBe('cohere')
    expect(s.still.minutes).toBe(15)
    expect(s.still.customIn).toBe(5)
    expect(s.still.customHold).toBe(4)
    expect(s.move?.mode).toBe('strength')
    expect(s.move?.rounds).toBe(10)
  })

  it('local copy wins over the server copy, and a write merges into the one key', () => {
    const st = store()
    writeTimerSettings({ cues: { bell: true, bellTone: 'bowl' } }, st)
    writeTimerSettings({ still: { minutes: 25 } }, st)
    const s = readTimerSettings(settingsFromPrefs({ minutes: 10, bell: false }), st)
    expect(s.cues.bell).toBe(true)
    expect(s.cues.bellTone).toBe('bowl')
    expect(s.still.minutes).toBe(25)
    expect(JSON.parse(st.map.get(TIMER_SETTINGS_KEY)!)).toEqual({ bell: true, bellTone: 'bowl', minutes: 25 })
  })

  it('a Get Moving change touches only the move slot, never the breath pattern', () => {
    const patch = prefsPatchFromSettings({ move: { mode: 'walk', walkMinutes: 30 } })
    expect(Object.keys(patch)).toEqual(['move'])
    expect(sanitizePrefsPatch(patch)).toEqual({ move: { mode: 'walk', walkMinutes: 30, walkIntervalMin: undefined } })
  })

  it('drops junk from a server patch and clamps what stays', () => {
    expect(sanitizePrefsPatch({ foo: 1, pattern: '', bellVolume: 7, warmupSec: 4 })).toEqual({ bellVolume: 1 })
    expect(sanitizePrefsPatch('nope')).toBeNull()
    expect(sanitizePrefsPatch({ ambientTrack: null, minutes: 999 })).toEqual({ ambientTrack: null, minutes: MINUTE_MAX })
  })

  it('diffs only the fields that moved', () => {
    const prev = { still: { patternSlug: 'box', minutes: 10 }, cues: { bell: false } }
    expect(diffSettings(prev, { still: { patternSlug: 'box', minutes: 12 }, cues: { bell: false } })).toEqual({ still: { minutes: 12 } })
    expect(diffSettings(prev, prev)).toBeNull()
    expect(diffSettings({ move: { mode: 'walk' } }, { move: { mode: 'run' } })).toEqual({ move: { mode: 'run' } })
  })
})
