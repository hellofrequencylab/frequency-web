import { describe, it, expect } from 'vitest'
import {
  WORKOUT_PRESETS,
  YOGA_PRESETS,
  MOVEMENT_MODES,
  buildWalk,
  buildYoga,
  buildPlay,
  buildWorkout,
  buildPlan,
  phaseAt,
  totalSeconds,
  workoutPresetByKind,
  yogaPresetByKind,
  clampRounds,
  clampSeconds,
} from './movement'

describe('modes + presets', () => {
  it('exposes the four movement modes', () => {
    expect(MOVEMENT_MODES.map((m) => m.mode)).toEqual(['walk', 'yoga', 'play', 'workout'])
  })

  it('ships Tabata 20/10x8, EMOM, AMRAP and Circuit workout presets', () => {
    expect(WORKOUT_PRESETS.map((p) => p.kind)).toEqual(['tabata', 'emom', 'amrap', 'circuit'])
    const tabata = workoutPresetByKind('tabata')
    expect(tabata.workSec).toBe(20)
    expect(tabata.restSec).toBe(10)
    expect(tabata.rounds).toBe(8)
    const emom = workoutPresetByKind('emom')
    expect(emom.workSec).toBe(60)
    expect(emom.restSec).toBe(0) // EMOM has no separate rest phase
    const amrap = workoutPresetByKind('amrap')
    expect(amrap.rounds).toBe(1)
    expect(amrap.restSec).toBe(0)
  })

  it('ships Yin / Vinyasa / Gentle yoga presets with holds', () => {
    expect(YOGA_PRESETS.map((p) => p.kind)).toEqual(['yin', 'vinyasa', 'gentle'])
    const yin = yogaPresetByKind('yin')
    expect(yin.holdSec).toBeGreaterThan(yogaPresetByKind('vinyasa').holdSec)
  })

  it('falls back to the first preset for unknown kinds', () => {
    expect(workoutPresetByKind('mystery').kind).toBe('tabata')
    expect(workoutPresetByKind(null).kind).toBe('tabata')
    expect(yogaPresetByKind('mystery').kind).toBe('yin')
  })
})

describe('clamps', () => {
  it('clamps seconds to a sane band and rounds', () => {
    expect(clampSeconds(-5)).toBe(1)
    expect(clampSeconds(10.4)).toBe(10)
    expect(clampSeconds(Number.NaN)).toBe(1)
    expect(clampSeconds(99 * 60 * 60)).toBe(4 * 60 * 60)
  })

  it('clamps rounds to 1..99', () => {
    expect(clampRounds(0)).toBe(1)
    expect(clampRounds(500)).toBe(99)
    expect(clampRounds(Number.NaN)).toBe(1)
  })
})

describe('buildWalk', () => {
  it('is one timed block behind a 3s lead-in', () => {
    const plan = buildWalk({ minutes: 20 })
    expect(plan.mode).toBe('walk')
    expect(plan.rounds).toBe(1)
    expect(plan.openEnded).toBe(false)
    expect(plan.phases.map((p) => p.kind)).toEqual(['prepare', 'work'])
    expect(plan.phases[0].seconds).toBe(3)
    expect(plan.phases[1].seconds).toBe(20 * 60)
    expect(totalSeconds(plan)).toBe(3 + 20 * 60)
  })
})

describe('buildYoga', () => {
  it('pre-expands into hold/transition phases, ending on a hold', () => {
    const plan = buildYoga({ kind: 'vinyasa', label: 'Vinyasa', blurb: '', holdSec: 40, transitionSec: 10, poses: 3 })
    expect(plan.mode).toBe('yoga')
    expect(plan.rounds).toBe(1)
    // prepare, hold, transition, hold, transition, hold  → ends on a hold (work)
    expect(plan.phases.map((p) => p.kind)).toEqual([
      'prepare', 'work', 'rest', 'work', 'rest', 'work',
    ])
    expect(plan.phases[plan.phases.length - 1].kind).toBe('work')
    expect(totalSeconds(plan)).toBe(3 + 40 * 3 + 10 * 2)
  })
})

describe('buildPlay', () => {
  it('is a single open-ended count-up', () => {
    const plan = buildPlay()
    expect(plan.mode).toBe('play')
    expect(plan.openEnded).toBe(true)
    expect(plan.phases).toHaveLength(1)
    expect(plan.phases[0].seconds).toBe(0)
    expect(totalSeconds(plan)).toBeNull()
  })
})

describe('buildWorkout', () => {
  it('is prepare then a repeating work+rest block over rounds', () => {
    const plan = buildWorkout({ kind: 'tabata', label: 'Tabata', blurb: '', workSec: 20, restSec: 10, rounds: 8 })
    expect(plan.mode).toBe('workout')
    expect(plan.rounds).toBe(8)
    // The stored block is the one-shot prepare + the single work/rest pair.
    expect(plan.phases.map((p) => p.kind)).toEqual(['prepare', 'work', 'rest'])
    // Total = 3 lead-in + (20 + 10) x 8.
    expect(totalSeconds(plan)).toBe(3 + (20 + 10) * 8)
  })

  it('drops the rest phase when restSec is 0 (EMOM)', () => {
    const plan = buildWorkout({ kind: 'emom', label: 'EMOM', blurb: '', workSec: 60, restSec: 0, rounds: 10 })
    expect(plan.phases.map((p) => p.kind)).toEqual(['prepare', 'work'])
    expect(totalSeconds(plan)).toBe(3 + 60 * 10)
  })
})

describe('buildPlan front door', () => {
  it('routes each mode and honours custom workout overrides', () => {
    expect(buildPlan({ mode: 'walk', walkMinutes: 30 }).phases[1].seconds).toBe(30 * 60)
    expect(buildPlan({ mode: 'yoga', yogaKind: 'yin' }).mode).toBe('yoga')
    expect(buildPlan({ mode: 'play' }).openEnded).toBe(true)
    const custom = buildPlan({ mode: 'workout', workoutKind: 'tabata', workSec: 30, restSec: 15, rounds: 5 })
    expect(custom.rounds).toBe(5)
    expect(totalSeconds(custom)).toBe(3 + (30 + 15) * 5)
  })
})

describe('phaseAt', () => {
  const tabata = buildWorkout({ kind: 'tabata', label: 'Tabata', blurb: '', workSec: 20, restSec: 10, rounds: 8 })

  it('reports the lead-in at the very start', () => {
    const pos = phaseAt(tabata, 0)
    expect(pos.phase.kind).toBe('prepare')
    expect(pos.round).toBe(1)
    expect(pos.remaining).toBe(3)
    expect(pos.nextLabel).toBe('Work')
  })

  it('enters round 1 work after the 3s lead-in', () => {
    const pos = phaseAt(tabata, 3) // exactly at the boundary → first work second
    expect(pos.phase.kind).toBe('work')
    expect(pos.round).toBe(1)
    expect(pos.remaining).toBe(20)
  })

  it('lands in round 1 rest mid-rest', () => {
    // 3 lead-in + 20 work = 23s in; +5 into the 10s rest.
    const pos = phaseAt(tabata, 28)
    expect(pos.phase.kind).toBe('rest')
    expect(pos.round).toBe(1)
    expect(pos.remaining).toBe(5)
    expect(pos.nextLabel).toBe('Work') // next round's work
  })

  it('advances the round counter across blocks', () => {
    // Round 1 = 30s (after the 3s lead-in). Round 2 work starts at 3 + 30 = 33s.
    const pos = phaseAt(tabata, 34)
    expect(pos.phase.kind).toBe('work')
    expect(pos.round).toBe(2)
  })

  it('reports done past the end', () => {
    const total = totalSeconds(tabata)!
    const pos = phaseAt(tabata, total + 5)
    expect(pos.done).toBe(true)
    expect(pos.remaining).toBe(0)
    expect(pos.round).toBe(8)
    expect(pos.nextLabel).toBeNull()
  })

  it('never ends an open-ended Play plan, counting up instead', () => {
    const play = buildPlay()
    const pos = phaseAt(play, 600)
    expect(pos.done).toBe(false)
    expect(pos.remaining).toBeNull()
    expect(pos.phaseElapsed).toBe(600)
    expect(pos.round).toBe(1)
  })

  it('walks a Yoga flow hold by hold', () => {
    const yoga = buildYoga({ kind: 'gentle', label: 'Gentle', blurb: '', holdSec: 30, transitionSec: 10, poses: 3 })
    // prepare 3 | hold 30 | trans 10 | hold 30 | trans 10 | hold 30
    expect(phaseAt(yoga, 1).phase.kind).toBe('prepare')
    expect(phaseAt(yoga, 4).phase.label).toBe('Pose 1')
    expect(phaseAt(yoga, 35).phase.kind).toBe('rest') // first transition (3+30=33..43)
    expect(phaseAt(yoga, 44).phase.label).toBe('Pose 2')
    const total = totalSeconds(yoga)!
    expect(phaseAt(yoga, total + 1).done).toBe(true)
  })

  it('handles a Walk: lead-in then one long block to the end', () => {
    const walk = buildWalk({ minutes: 10 })
    expect(phaseAt(walk, 1).phase.kind).toBe('prepare')
    expect(phaseAt(walk, 100).phase.kind).toBe('work')
    expect(phaseAt(walk, 100).remaining).toBe(10 * 60 - (100 - 3))
    expect(phaseAt(walk, 10 * 60 + 3 + 1).done).toBe(true)
  })
})
