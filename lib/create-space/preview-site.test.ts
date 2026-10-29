import { describe, expect, it } from 'vitest'
import { WIZARD_INTENTS } from '@/lib/spaces/create-wizard'
import { MEGA_THEMES } from '@/lib/theme/mega-theme'
import { INTENT_LOOK, PREVIEW_KITS, deriveSite, kitAccents, kitImagery } from '@/lib/create-space/preview-site'

const base = { name: '', handle: '', hostName: '', intents: [] as string[], kit: 'designer' as const }

describe('preview site', () => {
  it('describes every goal the wizard offers', () => {
    for (const i of WIZARD_INTENTS) expect(INTENT_LOOK[i.id], i.id).toBeTruthy()
  })

  it('every kit has pictures; every offered kit has accents', () => {
    for (const t of MEGA_THEMES) expect(kitImagery(t.id).strip).toHaveLength(3)
    for (const k of PREVIEW_KITS) expect(kitAccents(k.id).length, k.id).toBeGreaterThan(0)
  })

  it('reads as a sample Space when nothing is filled in', () => {
    const s = deriveSite(base)
    expect(s.name).toBe('Your Space')
    expect(s.em).toBe('start to finish.')
    expect(s.domain).toBe('frequency.community/yourspace')
    expect(s.offers).toHaveLength(3)
    expect(s.host).toBe('you')
  })

  it('takes the second line, verb and tagline from the picks', () => {
    const s = deriveSite({ ...base, name: 'Saltwater Collective', handle: 'saltwatercollective', hostName: 'Sam Rivera', intents: ['classes', 'events'] })
    expect(s.em).toBe('every week.')
    expect(s.ctaLong).toBe('Join now')
    expect(s.eyebrow).toBe('Memberships · Events')
    expect(s.tagline).toBe('Classes and gatherings, all in one place.')
    expect(s.links[2]).toBe('About Sam')
    expect(s.offers.map((o) => o.n)).toEqual(['I', 'II', 'III'])
  })
})
