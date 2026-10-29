// THE FREE HUMAN SKY (design: the Calendar hero's Season and Moon, and the Year Wheel's moons and seasons). PURE: no React, no
// Next, no database, no clock; every function takes the date it is asked about.
//
// The moon is the mean synthetic month from a known new moon (2000-01-06 18:14 UTC), good to about a day. That is plenty for
// "Waning gibbous, full in 27 days" and for drawing a phase; it is not an almanac, so a block that prints an exact moment
// (an eclipse) takes it from a hand-entered table instead.

const SYNODIC = 29.530588853
const NEW_MOON_2000 = Date.UTC(2000, 0, 6, 18, 14)
const DAY = 86_400_000
const PHASES = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'] as const

export interface FreeHumanMoon {
  /** Days since the last new moon, 0 up to 29.53. */
  age: number
  /** 0 to 7: new, waxing crescent, first quarter, waxing gibbous, full, waning gibbous, last quarter, waning crescent. */
  phase: number
  name: string
  /** Whole days to the next full moon; 0 on the day it is full. */
  toFull: number
  /** "Full tonight", "Full in 1 day", "Full in 27 days". */
  nextLine: string
}

/** The moon on a date. */
export function freeHumanMoon(date: Date): FreeHumanMoon {
  const age = ((((date.getTime() - NEW_MOON_2000) / DAY) % SYNODIC) + SYNODIC) % SYNODIC
  const phase = Math.round((age / SYNODIC) * 8) % 8
  const toFull = Math.round((((SYNODIC / 2 - age) % SYNODIC) + SYNODIC) % SYNODIC)
  return { age, phase, name: PHASES[phase], toFull, nextLine: toFull === 0 ? 'Full tonight' : `Full in ${toFull} ${toFull === 1 ? 'day' : 'days'}` }
}

export type FreeHumanSeasonKey = 'winter' | 'spring' | 'summer' | 'autumn'

const SEASONS: Record<FreeHumanSeasonKey, { name: string; module: string }> = {
  winter: { name: 'Winter', module: 'Rest' },
  spring: { name: 'Spring', module: 'Embody' },
  summer: { name: 'Summer', module: 'Create' },
  autumn: { name: 'Autumn', module: 'Raise' },
}

/** The program's season for a month (0 is January): winter December to February, spring March to May, summer June to August,
 *  autumn September to November. */
export function freeHumanSeason(month: number): { key: FreeHumanSeasonKey; name: string; module: string; line: string } {
  const key: FreeHumanSeasonKey = month === 11 || month <= 1 ? 'winter' : month <= 4 ? 'spring' : month <= 7 ? 'summer' : 'autumn'
  const s = SEASONS[key]
  return { key, ...s, line: `${s.name} · ${s.module}` }
}
