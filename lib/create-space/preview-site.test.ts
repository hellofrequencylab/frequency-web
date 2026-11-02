import { describe, expect, it } from 'vitest'
import { WIZARD_INTENTS } from '@/lib/spaces/create-wizard'
import { MEGA_THEMES } from '@/lib/theme/mega-theme'
import { INTENT_LOOK, PREVIEW_CLIP, PREVIEW_KITS, asSentence, clipPreview, deriveSite, kitAccents, kitImagery } from '@/lib/create-space/preview-site'

const base = { name: '', handle: '', hostName: '', intents: [] as string[], kit: 'designer' as const }

describe('preview site', () => {
  it('describes every goal the wizard offers', () => {
    for (const i of WIZARD_INTENTS) expect(INTENT_LOOK[i.id], i.id).toBeTruthy()
  })

  it('every kit has pictures; every offered kit has accents', () => {
    for (const t of MEGA_THEMES) {
      expect(kitImagery(t.id).strip).toHaveLength(3)
      expect(kitImagery(t.id).covers.length, t.id).toBeGreaterThan(0)
      expect(kitImagery(t.id).portraits.length, t.id).toBeGreaterThan(0)
    }
    expect(kitImagery('designer').covers).toHaveLength(5)
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

  it('is a ghost until step 2, then their own sentence is the tagline', () => {
    expect(deriveSite(base).fromOffer).toBe(false)
    const s = deriveSite({ ...base, intents: ['classes'], offer: 'weekly pottery classes and open studio nights' })
    expect(s.fromOffer).toBe(true)
    expect(s.tagline).toBe('Weekly pottery classes and open studio nights.')
    expect(deriveSite({ ...base, offer: 'x'.repeat(200) }).tagline).toHaveLength(PREVIEW_CLIP.tagline)
  })

  it('fills the contact strip from step 3 and leaves it empty before', () => {
    expect(deriveSite(base).contact).toEqual({ visit: '', write: '', call: '' })
    const s = deriveSite({ ...base, reach: { email: 'sam@example.com', phone: '555 0100', where: 'Carlsbad' } })
    expect(s.contact).toEqual({ visit: 'Carlsbad', write: 'sam@example.com', call: '555 0100' })
  })

  it('clips and cleans what it shows', () => {
    expect(clipPreview('  **Bold** `code`  — and  more  ', 40)).toBe('Bold code , and more')
    expect(asSentence('hello  there')).toBe('Hello there.')
    expect(asSentence('Done!')).toBe('Done!')
    expect(asSentence('   ')).toBe('')
    for (const o of deriveSite(base).offers) expect(o.t.length).toBeLessThanOrEqual(PREVIEW_CLIP.offerTitle)
  })
})
