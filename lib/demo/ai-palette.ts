// Demographic-aware palette for the Seed Studio (ADR-091). ONE cheap model call
// per area turns a real place into a believable demographic palette — names that
// fit the locale, the activities that actually happen there, a one-line vibe, and
// journey titles — which the deterministic template engine then expands into
// hundreds of rows. Unobtrusive by design: a single Haiku call, cached system
// prompt, and it FAILS SOFT to the built-in template pools when AI is off, the
// budget is spent, or anything goes wrong (so seeding never breaks).

import { aiEnabled } from '@/lib/ai/client'
import { completeText } from '@/lib/ai/complete'
import { log } from '@/lib/log'

export type Palette = {
  firstNames: string[]
  lastNames: string[]
  /** channel slug -> short local activity phrases */
  activities: Record<string, string[]>
  /** one short phrase describing the local vibe (used as a flavor variable) */
  vibe: string
  /** short, human journey/plan titles */
  journeyTitles: string[]
}

const SYSTEM =
  'You generate a compact, demographically-realistic palette for seeding a believable ' +
  'local-community demo. Given a place and a set of interest channels, return names, ' +
  'activities, a vibe phrase, and journey titles that genuinely fit that locale\'s ' +
  'demographics (common given names + surnames for the area, real local activities). ' +
  'Be tasteful and inclusive; avoid stereotypes and brand names. Output STRICT JSON ONLY, ' +
  'no prose, matching exactly: {"firstNames":[20 strings],"lastNames":[20 strings],' +
  '"activities":{"<channel-slug>":[5 short phrases]},"vibe":"short phrase",' +
  '"journeyTitles":[8 short titles]}.'

function safeParse(text: string): Palette | null {
  try {
    const a = text.indexOf('{')
    const b = text.lastIndexOf('}')
    if (a < 0 || b <= a) return null
    const j = JSON.parse(text.slice(a, b + 1))
    if (!Array.isArray(j.firstNames) || !Array.isArray(j.lastNames) || typeof j.activities !== 'object') {
      return null
    }
    return {
      firstNames: j.firstNames.filter((s: unknown) => typeof s === 'string').slice(0, 40),
      lastNames: j.lastNames.filter((s: unknown) => typeof s === 'string').slice(0, 40),
      activities: j.activities ?? {},
      vibe: typeof j.vibe === 'string' ? j.vibe : '',
      journeyTitles: Array.isArray(j.journeyTitles) ? j.journeyTitles.filter((s: unknown) => typeof s === 'string') : [],
    }
  } catch {
    return null
  }
}

/** Best-effort demographic palette for an area. Returns null (→ template pools)
 *  whenever AI is unavailable or anything fails — seeding must never depend on it. */
export async function getDemographicPalette(input: {
  areaName: string
  lat: number
  lng: number
  channels: string[]
}): Promise<Palette | null> {
  if (!aiEnabled()) return null
  const user =
    `Place: ${input.areaName} (lat ${input.lat.toFixed(3)}, lng ${input.lng.toFixed(3)}).\n` +
    `Interest channels: ${input.channels.join(', ') || 'movement, holistic-health, creative'}.\n` +
    `Return the JSON palette for this exact place.`
  try {
    const { text } = await completeText({
      system: SYSTEM,
      messages: [{ role: 'user', content: user }],
      tier: 'haiku',
      maxTokens: 900,
      cacheSystem: true,
    })
    const p = safeParse(text)
    if (!p || p.firstNames.length < 6 || p.lastNames.length < 6) return null
    return p
  } catch (e) {
    log.warn('demo.palette.failed', { error: e instanceof Error ? e.message : String(e) })
    return null
  }
}
