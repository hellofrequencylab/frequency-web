// The moon's phase as a plain calendar fact for the Midnight top bar (design: the bar's left side). Pure: the age
// of the moon in days since a reference new moon, folded into the eight names a calendar prints.

const SYNODIC_DAYS = 29.530588853
const REFERENCE_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14)
const DAY_MS = 86_400_000

const NAMES = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'] as const
const SIGILS = ['moon-new', 'moon-waxing', 'moon-quarter', 'moon-gibbous', 'moon-full', 'moon-waning', 'moon-quarter', 'moon-waning'] as const

export function midnightMoon(now: Date): { name: (typeof NAMES)[number]; sigil: (typeof SIGILS)[number] } {
  const age = (((now.getTime() - REFERENCE_NEW_MOON) / DAY_MS) % SYNODIC_DAYS + SYNODIC_DAYS) % SYNODIC_DAYS
  const i = Math.floor(((age / SYNODIC_DAYS) * 8 + 0.5) % 8)
  return { name: NAMES[i], sigil: SIGILS[i] }
}
