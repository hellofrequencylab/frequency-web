import { describe, expect, it } from 'vitest'
import {
  TIMER_SETUP_IDS,
  describeTimer,
  recommendTimerPicks,
  resolveTimerPicks,
  timerSetupPatch,
} from './timer-setups'
import { BREATH_PATTERNS } from '@/lib/on-air'
import { buildPlan, totalSeconds } from '@/lib/movement'

describe('every catalog setup is a configuration the timer already runs', () => {
  it.each(TIMER_SETUP_IDS)('%s writes a valid, self-consistent set of timer columns', (id) => {
    const patch = timerSetupPatch(id)
    expect(['mindless', 'movement', 'none']).toContain(patch.timer_kind)
    if (patch.timer_kind === 'movement') {
      expect(patch.movement_config).toBeTruthy()
      const total = totalSeconds(buildPlan(patch.movement_config!))
      // The session length follows the plan, so the card and the log agree with the timer.
      expect(patch.duration_min).toBe(total != null ? Math.max(1, Math.round(total / 60)) : null)
    } else {
      expect(patch.movement_config).toBeNull()
    }
    if (patch.breath_pattern) expect(BREATH_PATTERNS.map((p) => p.slug)).toContain(patch.breath_pattern)
    if (patch.timer_kind === 'none') expect(patch).not.toHaveProperty('duration_min')
  })

  it("takes the author's length where a setup has one length, and never bends a fixed shape", () => {
    expect(timerSetupPatch('quiet-sit', 12).duration_min).toBe(12)
    expect(timerSetupPatch('easy-walk', 45)).toMatchObject({ duration_min: 45, movement_config: { mode: 'walk', walkMinutes: 45 } })
    expect(timerSetupPatch('tabata', 45)).toEqual(timerSetupPatch('tabata'))
    expect(timerSetupPatch('quiet-sit', Number.NaN).duration_min).toBe(5)
  })
})

describe('recommendTimerPicks reads what the author wrote', () => {
  const top = (signals: Parameters<typeof recommendTimerPicks>[0]) => recommendTimerPicks(signals)[0]

  it.each([
    [{ title: 'Box breathing before a hard call' }, 'box-breathing', 'breath'],
    [{ title: 'Evening walk', summary: 'Twenty easy minutes outside' }, 'easy-walk', 'walk'],
    [{ title: 'Morning pages', body: 'Write three lines before you look at your phone.' }, 'timed-journal', 'writing'],
    [{ title: 'Text one friend' }, 'log-it', 'act'],
    [{ title: 'Tabata finisher' }, 'tabata', 'intervals'],
    [{ title: 'Two minute sit' }, 'quiet-sit', 'sit'],
    [{ title: 'Wind down before bed' }, 'wind-down-breathing', 'wind_down'],
  ] as const)('%j leads with %s', (signals, setupId, reasonId) => {
    expect(top(signals)).toMatchObject({ setupId, reasonId })
  })

  it('always offers three different setups, even for a blank draft', () => {
    const picks = recommendTimerPicks({})
    expect(picks).toHaveLength(3)
    expect(new Set(picks.map((p) => p.setupId)).size).toBe(3)
    expect(picks.every((p) => p.reasonId === 'general')).toBe(true)
  })

  it('carries a length the author set or wrote', () => {
    expect(top({ title: 'Morning sit', durationMin: 12 }).minutes).toBe(12)
    expect(top({ title: 'Morning sit', body: 'Set a timer for 10 minutes.' }).minutes).toBe(10)
    expect(resolveTimerPicks(recommendTimerPicks({ title: 'Morning sit', durationMin: 12 }))[0].patch.duration_min).toBe(12)
  })
})

describe('resolveTimerPicks shows only reviewed words', () => {
  it('drops unknown ids, keeps the first of a repeat, and stops at three', () => {
    const out = resolveTimerPicks([
      { setupId: 'nope' as never, reasonId: 'general' },
      { setupId: 'quiet-sit', reasonId: 'sit' },
      { setupId: 'quiet-sit', reasonId: 'general' },
      { setupId: 'easy-walk', reasonId: 'invented' as never },
      { setupId: 'log-it', reasonId: 'act' },
      { setupId: 'tabata', reasonId: 'intervals' },
    ])
    expect(out.map((s) => s.id)).toEqual(['quiet-sit', 'easy-walk', 'log-it'])
    expect(out[0].reason).toBe('You describe a quiet sit, so a simple countdown fits.')
    // An unknown reason falls back to the neutral one; a model cannot supply its own sentence.
    expect(out[1].reason).toBe('A common place to start. You can change it any time.')
    expect(out.map((s) => s.preview)).toEqual(['Be Still · Meditate · 5 min', 'Get Moving · 20 min walk', 'Log it'])
  })
})

describe('describeTimer says what a member will get', () => {
  it('names the mode, the shape and the length', () => {
    expect(describeTimer({ timerKind: 'mindless', mindlessMode: 'breathe', breathPattern: 'box', durationMin: 5 })).toMatchObject({
      mode: 'Be Still', energy: 'still', headline: 'Breathe · Box · 5 min', unset: false,
    })
    expect(describeTimer({ timerKind: 'movement', movementConfig: { mode: 'strength', strengthKind: 'tabata' } })).toMatchObject({
      mode: 'Get Moving', energy: 'charge', headline: 'Tabata, 8 rounds · 4 min',
    })
    expect(describeTimer({ timerKind: 'none' })).toMatchObject({ mode: 'Log it', headline: 'Log it' })
    expect(describeTimer({ timerKind: 'mindless', mindlessMode: 'log' }).mode).toBe('Log it')
  })

  it('flags the untouched default so the author is asked to set it up', () => {
    expect(describeTimer({ timerKind: 'mindless' })).toMatchObject({ headline: 'Open length', unset: true })
    expect(describeTimer({ timerKind: 'mindless', durationMin: 5 }).unset).toBe(false)
    expect(describeTimer({}).unset).toBe(true)
  })

  it('says whether the length can change, and mentions the count-in only when one is set', () => {
    expect(describeTimer({ timerKind: 'mindless', mindlessMode: 'meditate', durationMin: 10, durationLocked: true }).facts).toContain('The length is fixed.')
    const open = describeTimer({ timerKind: 'mindless', mindlessMode: 'meditate', durationMin: 10, warmupSec: 10, warmupMessage: 'Roll your shoulders.' }).facts
    expect(open).toContain('You can change the length when you start.')
    expect(open).toContain('Counts in for 10 seconds before it starts.')
    expect(open).toContain('Shows a warm-up note while it counts in.')
  })

  it('never uses a long dash in member copy', () => {
    for (const id of TIMER_SETUP_IDS) {
      const [s] = resolveTimerPicks([{ setupId: id, reasonId: 'general' }])
      expect(`${s.label} ${s.detail} ${s.reason} ${s.preview}`).not.toMatch(/[—–]/)
    }
  })
})
