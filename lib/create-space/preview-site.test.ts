import { describe, expect, it } from 'vitest'
import { WIZARD_INTENTS } from '@/lib/spaces/create-wizard'
import { MEGA_THEMES } from '@/lib/theme/mega-theme'
import { TEMPLE_KIT_PROFILES } from '@/lib/theme/temple-kit'
import { FREE_HUMAN_PROFILES } from '@/lib/theme/free-human'
import { SERVICES_ACCENTS } from '@/lib/theme/services'
import { NEW_WORLD_ACCENTS } from '@/lib/theme/new-world'
import { INTENT_LOOK, PREVIEW_CLIP, PREVIEW_KITS, asSentence, clipPreview, deriveSite, kitAccentFill, kitAccentIndex, kitAccents, kitImagery } from '@/lib/create-space/preview-site'

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

  it('every kit wears its own accents, never another kit\'s (Daniel, 2026-11-03)', () => {
    const fills = (k: Parameters<typeof kitAccents>[0]) => kitAccents(k).map((a) => a.fill)
    expect(fills('temple-kit')[0]).toBe(TEMPLE_KIT_PROFILES.general.accent)
    expect(fills('temple-kit')).not.toEqual(fills('temple'))
    expect(new Set(fills('temple-kit')).size).toBe(fills('temple-kit').length)
    expect(fills('free-human')[0]).toBe(FREE_HUMAN_PROFILES.general.accent)
    expect(fills('services')[0]).toBe(SERVICES_ACCENTS.tide.accent)
    expect(fills('services')).toHaveLength(6)
    expect(fills('new-world')[0]).toBe(NEW_WORLD_ACCENTS.tide.accent)
    expect(kitImagery('temple-kit').hero).toMatch(/^\/sites\/temple-kit\/photos\//)
  })

  it('Wildheart wears its own five pictures, never the gathering photos (LIVE-2173)', () => {
    const wh = kitImagery('wildheart')
    expect(wh.hero).toBe('/brand/wildheart/photos/sisters-shore.jpg')
    expect(wh.covers).toHaveLength(5)
    for (const c of [...wh.covers, ...wh.strip]) expect(c).toMatch(/^\/brand\/wildheart\/photos\//)
  })

  it('Free Human wears its own library; Services wears New World\'s until it has one (LIVE-2102)', () => {
    const fh = kitImagery('free-human')
    expect(fh.hero).toBe('/sites/free-human/photos/heritage-a-virgin.webp')
    expect(fh.portrait).toMatch(/^\/sites\/free-human\/photos\//)
    for (const src of [...fh.strip, ...fh.covers, ...fh.portraits]) expect(src).toMatch(/^\/sites\/free-human\/photos\//)
    expect(fh).not.toEqual(kitImagery('frequency'))
    expect(kitImagery('services').hero).toMatch(/^\/sites\/new-world\/photos\//)
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
    const g = deriveSite({ ...base, ghost: true })
    expect(g.em).toBe('')
    expect(g.eyebrow).toBe('A Space on Frequency')
    expect(g.tagline).toContain('mocked up from what you offer')
    expect(g.offers.map((o) => o.t)).toEqual(['Your first offering', 'What people book', 'A way to stay close'])
    expect(g.offers[0].img).toBeTruthy()
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

  it('turns a carried accent place into the kit accent hex, and nothing into nothing', () => {
    expect(kitAccentFill('designer', '2')).toBe('#4E6E71')
    expect(kitAccentFill('designer', 1)).toBe('#A65A3A')
    expect(kitAccentFill('designer', '9')).toBeNull()
    expect(kitAccentFill('not-a-kit', '0')).toBeNull()
    expect(kitAccentFill('designer', 'x')).toBeNull()
    expect(kitAccentFill('network', '0')).toBeNull()
  })
})

describe('the /themes page accents reach the builder', () => {
  const KIT_OF: Record<string, string> = { 'new-world': 'new-world', network: 'network-kit', services: 'services', designer: 'designer', bold: 'bold', temple: 'temple-kit', cyberwitch: 'cyberwitch', wildheart: 'wildheart', nocturne: 'midnight' }
  it('every swatch on a theme page resolves to an accent in its kit by hex', async () => {
    const { THEMES } = await import('@/components/frequency/site/pages/themes/kit-showcase/data')
    for (const th of THEMES) {
      const kit = KIT_OF[th.id as string]
      if (!kit) continue
      for (const a of th.accents as { label: string; hex: string }[]) {
        expect(kitAccentIndex(kit, a.hex.replace('#', '')), `${th.id} ${a.label}`).not.toBeNull()
      }
    }
  })
  it('no kit lists two accents under one name or one colour', () => {
    for (const id of Object.keys(KIT_OF_ALL)) {
      const l = kitAccents(id as never)
      expect(new Set(l.map((a) => a.name.toLowerCase())).size, id).toBe(l.length)
      expect(new Set(l.map((a) => a.fill.toLowerCase())).size, id).toBe(l.length)
    }
  })
})
const KIT_OF_ALL: Record<string, true> = { 'new-world': true, 'network-kit': true, services: true, designer: true, bold: true, 'temple-kit': true, cyberwitch: true, wildheart: true, midnight: true }
