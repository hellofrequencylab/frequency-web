// THE WILDHEART SYMBOL LIBRARY (the design handoff's SYMBOL_LIBRARY, 2026-10-12). PURE DATA. One family:
// every glyph is drawn the same way, in the one violet symbol ink (`--wh-symbol-ink`), at one line weight,
// through the ink-bleed filter (components/sites/wildheart-symbols.tsx). NEVER EMOJI: every glyph carries
// U+FE0E, the text-presentation selector, so no platform swaps in a colour emoji; the moon phases are
// drawn as SVG paths (moonPhasePath) because their Unicode forms have no text presentation at all.
// lib/theme/wildheart-symbols.test.ts holds the line.

/** The text-presentation selector, appended to every glyph. */
export const TEXT_PRESENTATION = '︎'

const glyph = (codepoint: number) => String.fromCodePoint(codepoint) + TEXT_PRESENTATION

/** The twelve signs in tropical order (the order the sun walks them from the spring equinox). Each with
 *  its house numeral and the house's one-word meaning, gender-neutral as the theme ships it. */
export const ZODIAC = [
  { id: 'aries', name: 'Aries', glyph: glyph(0x2648), house: 'I', houseName: 'Self' },
  { id: 'taurus', name: 'Taurus', glyph: glyph(0x2649), house: 'II', houseName: 'Values' },
  { id: 'gemini', name: 'Gemini', glyph: glyph(0x264a), house: 'III', houseName: 'Voice' },
  { id: 'cancer', name: 'Cancer', glyph: glyph(0x264b), house: 'IV', houseName: 'Home' },
  { id: 'leo', name: 'Leo', glyph: glyph(0x264c), house: 'V', houseName: 'Pleasure' },
  { id: 'virgo', name: 'Virgo', glyph: glyph(0x264d), house: 'VI', houseName: 'Devotion' },
  { id: 'libra', name: 'Libra', glyph: glyph(0x264e), house: 'VII', houseName: 'Partners' },
  { id: 'scorpio', name: 'Scorpio', glyph: glyph(0x264f), house: 'VIII', houseName: 'Depths' },
  { id: 'sagittarius', name: 'Sagittarius', glyph: glyph(0x2650), house: 'IX', houseName: 'Meaning' },
  { id: 'capricorn', name: 'Capricorn', glyph: glyph(0x2651), house: 'X', houseName: 'Calling' },
  { id: 'aquarius', name: 'Aquarius', glyph: glyph(0x2652), house: 'XI', houseName: 'Community' },
  { id: 'pisces', name: 'Pisces', glyph: glyph(0x2653), house: 'XII', houseName: 'Mystery' },
] as const

export type ZodiacId = (typeof ZODIAC)[number]['id']

/** The alchemical set: the four elements and quintessence, with the Sun and Moon. */
export const ALCHEMICAL = [
  { id: 'fire', name: 'Fire', glyph: glyph(0x1f702), meaning: 'will' },
  { id: 'water', name: 'Water', glyph: glyph(0x1f704), meaning: 'feeling' },
  { id: 'air', name: 'Air', glyph: glyph(0x1f701), meaning: 'breath' },
  { id: 'earth', name: 'Earth', glyph: glyph(0x1f703), meaning: 'body' },
  { id: 'quintessence', name: 'Quintessence', glyph: glyph(0x1f700), meaning: 'spirit' },
  { id: 'sun', name: 'Sun', glyph: glyph(0x2609), meaning: 'vitality' },
  { id: 'moon', name: 'Moon', glyph: glyph(0x263d), meaning: 'feeling' },
] as const

/** The marks: the festival star, the intention spark, the triple moon. */
export const MARKS = [
  { id: 'star', name: 'Star', glyph: glyph(0x2736), meaning: 'festival' },
  { id: 'spark', name: 'Spark', glyph: glyph(0x2726), meaning: 'intention' },
  { id: 'waning', name: 'Waning moon', glyph: glyph(0x263e), meaning: 'release' },
  { id: 'triplemoon', name: 'Triple moon', glyph: glyph(0x263d) + glyph(0x25ef) + glyph(0x263e), meaning: 'maiden, mother, crone' },
] as const

/** Every glyph by id, the one lookup the components read. */
export const WILDHEART_GLYPHS: Readonly<Record<string, string>> = Object.fromEntries(
  [...ZODIAC, ...ALCHEMICAL, ...MARKS].map((s) => [s.id, s.glyph]),
)

/** The eight moon phases, in order from the new moon. */
export const MOON_PHASES = [
  'New moon',
  'Waxing crescent',
  'First quarter',
  'Waxing gibbous',
  'Full moon',
  'Waning gibbous',
  'Last quarter',
  'Balsamic moon',
] as const

/** The lit fraction of each phase. */
const LIT = [0, 0.25, 0.5, 0.75, 1, 0.75, 0.5, 0.25] as const

/** The SVG path of the LIT part of a moon of radius `r` centred on (cx, cy) at `phase` 0 to 7, or '' for
 *  the new moon. The limb is a semicircle; the terminator is a half ellipse whose x radius follows the
 *  cosine of the phase angle, bowing toward the dark side. Waxing moons light the right. PURE. */
export function moonPhasePath(phase: number, r: number, cx = r, cy = r): string {
  const p = ((phase % 8) + 8) % 8
  const lit = LIT[p]
  if (lit === 0) return ''
  const top = `${cx},${cy - r}`
  const bottom = `${cx},${cy + r}`
  if (lit === 1) return `M${top}A${r},${r} 0 1 1 ${bottom}A${r},${r} 0 1 1 ${top}Z`
  const waxing = p < 4
  const rx = +Math.abs(r * Math.cos((p / 8) * Math.PI * 2)).toFixed(3)
  const limbSweep = waxing ? 1 : 0
  // The terminator bows toward the dark side: out past the lit limb for a crescent, into it for a gibbous.
  const terminatorSweep = lit < 0.5 ? (waxing ? 0 : 1) : lit > 0.5 ? (waxing ? 1 : 0) : waxing ? 1 : 0
  if (lit === 0.5) return `M${top}A${r},${r} 0 0 ${limbSweep} ${bottom}Z`
  return `M${top}A${r},${r} 0 0 ${limbSweep} ${bottom}A${rx},${r} 0 0 ${terminatorSweep} ${top}Z`
}
