// The astrology engine (Resonance Feed Phase 5, ADR-419 →
// docs/RESONANCE-FEED-ARCHITECTURE.md §6). Pure, deterministic, unit-tested. Sun-sign
// based (no ephemeris dependency): a birth DATE is enough; time + place are reserved on
// the stored birth_data for a future fuller chart but unused here. Compatibility is the
// classic element model (fire/earth/air/water + cardinal/fixed/mutable), surfaced as a
// QUIET soft signal in matching, never a verdict.

export type ZodiacSign =
  | 'aries' | 'taurus' | 'gemini' | 'cancer' | 'leo' | 'virgo'
  | 'libra' | 'scorpio' | 'sagittarius' | 'capricorn' | 'aquarius' | 'pisces'

export type Element = 'fire' | 'earth' | 'air' | 'water'
export type Modality = 'cardinal' | 'fixed' | 'mutable'

interface SignInfo {
  label: string
  element: Element
  modality: Modality
  symbol: string
}

export const SIGN_INFO: Record<ZodiacSign, SignInfo> = {
  aries: { label: 'Aries', element: 'fire', modality: 'cardinal', symbol: '♈' },
  taurus: { label: 'Taurus', element: 'earth', modality: 'fixed', symbol: '♉' },
  gemini: { label: 'Gemini', element: 'air', modality: 'mutable', symbol: '♊' },
  cancer: { label: 'Cancer', element: 'water', modality: 'cardinal', symbol: '♋' },
  leo: { label: 'Leo', element: 'fire', modality: 'fixed', symbol: '♌' },
  virgo: { label: 'Virgo', element: 'earth', modality: 'mutable', symbol: '♍' },
  libra: { label: 'Libra', element: 'air', modality: 'cardinal', symbol: '♎' },
  scorpio: { label: 'Scorpio', element: 'water', modality: 'fixed', symbol: '♏' },
  sagittarius: { label: 'Sagittarius', element: 'fire', modality: 'mutable', symbol: '♐' },
  capricorn: { label: 'Capricorn', element: 'earth', modality: 'cardinal', symbol: '♑' },
  aquarius: { label: 'Aquarius', element: 'air', modality: 'fixed', symbol: '♒' },
  pisces: { label: 'Pisces', element: 'water', modality: 'mutable', symbol: '♓' },
}

// Sign start cutoffs as (month*100 + day), in calendar order. Standard western tropical
// dates. The sign for a date is the LAST cutoff at or before it; anything before the
// first cutoff (Jan 1 to 19) or on/after the last (Dec 22 to 31) is Capricorn, which
// wraps the year.
const SIGN_CUTOFFS: { at: number; sign: ZodiacSign }[] = [
  { at: 120, sign: 'aquarius' },
  { at: 219, sign: 'pisces' },
  { at: 321, sign: 'aries' },
  { at: 420, sign: 'taurus' },
  { at: 521, sign: 'gemini' },
  { at: 621, sign: 'cancer' },
  { at: 723, sign: 'leo' },
  { at: 823, sign: 'virgo' },
  { at: 923, sign: 'libra' },
  { at: 1023, sign: 'scorpio' },
  { at: 1122, sign: 'sagittarius' },
  { at: 1222, sign: 'capricorn' },
]

/** The sun sign for a 'YYYY-MM-DD' birth date, or null if it can't be parsed. Pure. */
export function sunSign(birthDate: string | null | undefined): ZodiacSign | null {
  if (!birthDate) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate.trim())
  if (!m) return null
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const v = month * 100 + day
  // Default Capricorn covers Jan 1 to 19 (before the first cutoff) and Dec 22 to 31.
  let sign: ZodiacSign = 'capricorn'
  for (const c of SIGN_CUTOFFS) {
    if (v >= c.at) sign = c.sign
  }
  return sign
}

// Element relationships -> a base compatibility in [0,1]. Same element resonates; the
// classic complementary pairs (fire+air, earth+water) flow; the cross pairs are spicier.
const ELEMENT_PAIR: Record<Element, Record<Element, number>> = {
  fire: { fire: 0.85, air: 0.9, earth: 0.45, water: 0.4 },
  air: { air: 0.85, fire: 0.9, water: 0.5, earth: 0.45 },
  earth: { earth: 0.85, water: 0.9, fire: 0.45, air: 0.45 },
  water: { water: 0.85, earth: 0.9, air: 0.5, fire: 0.4 },
}

export interface SignCompatibility {
  score: number // 0..1
  /** A short, plain, never-overstated reason. */
  reason: string
}

/** Compatibility between two sun signs. Pure. Element base, lightly lifted when the
 *  modalities differ (cardinal/fixed/mutable balance each other) and nudged for the
 *  same sign (familiar, but can be too alike). */
export function signCompatibility(a: ZodiacSign, b: ZodiacSign): SignCompatibility {
  const ea = SIGN_INFO[a].element
  const eb = SIGN_INFO[b].element
  let score = ELEMENT_PAIR[ea][eb]

  // Different modalities tend to complement; identical can stalemate. Small effect.
  if (SIGN_INFO[a].modality !== SIGN_INFO[b].modality) score += 0.05
  else score -= 0.03

  // Same sign: familiar resonance, but cap so it never reads as "perfect".
  if (a === b) score = Math.min(score + 0.04, 0.9)

  score = Math.max(0, Math.min(1, score))

  const sameElement = ea === eb
  const reason = sameElement
    ? `you're both ${ea} signs`
    : score >= 0.85
      ? `${ea} and ${eb} tend to click`
      : 'a spicier elemental mix'
  return { score, reason }
}
