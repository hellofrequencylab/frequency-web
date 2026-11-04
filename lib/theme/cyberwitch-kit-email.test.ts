import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/lib/spaces/accent'
import { CYBERWITCH_ACCENTS, CYBERWITCH_ON_ACCENT } from '@/lib/theme/cyberwitch'
import { CYBERWITCH_EMAIL_TYPES, cyberwitchKitEmail, type CyberWitchKitEmailBrand } from '@/lib/theme/cyberwitch-kit-email'

// The CyberWitch kit's eleven emails: email-safe markup, one dark register, the accent and corners as literals, ink on the accent
// button, the design's faces with fallbacks, escaped input, and the voice rules.

const HEX = { fill: CYBERWITCH_ACCENTS.hex.accent, text: CYBERWITCH_ACCENTS.hex.text }
const ICE = { fill: CYBERWITCH_ACCENTS.ice.accent, text: CYBERWITCH_ACCENTS.ice.text }

const brand = (over: Partial<CyberWitchKitEmailBrand> = {}): CyberWitchKitEmailBrand => ({
  name: 'Ash <Studio>',
  descriptor: 'Readings and ritual',
  accent: HEX,
  owner: 'Sam Ortega',
  role: 'Owner',
  city: 'San Diego',
  phone: '555-0100',
  postalLine: '1 Main Street, San Diego, CA 92101',
  siteUrl: 'https://ashstudio.example',
  siteLabel: 'ashstudio.example',
  unsubscribeUrl: 'https://ashstudio.example/unsubscribe',
  ...over,
})
const rows = [
  { lead: 'Guide', title: 'First reading tips', sub: '4 min read' },
  { lead: 'Story', title: 'A week on the job', sub: '3 min read' },
]

describe('the CyberWitch kit emails', () => {
  it('builds all eleven with a subject, html and text', () => {
    expect(CYBERWITCH_EMAIL_TYPES).toHaveLength(11)
    for (const t of CYBERWITCH_EMAIL_TYPES) {
      const e = cyberwitchKitEmail(t, brand(), { rows })
      expect(e.subject, t).toMatch(/\S/)
      expect(e.html, t).toContain('<table')
      expect(e.text, t).toContain('Unsubscribe')
      expect(e.html, t).not.toMatch(/\b(undefined|null|NaN)\b/)
      expect(e.html, t).not.toMatch(/<script|<form|position:\s*absolute|display:\s*flex|display:\s*grid/i)
      expect(e.html, t).not.toContain('var(--')
    }
  })

  it('is dark only: iron page, bone text and the accent as literals', () => {
    const e = cyberwitchKitEmail('confirm', brand({ accent: ICE }))
    expect(e.html).toContain('#0D1112')
    expect(e.html).toContain('#ECE8DF')
    expect(e.html).toContain(ICE.fill)
    expect(e.html).toContain('dark only')
  })

  it('puts ink on the filled accent button, and every preset reads', () => {
    expect(cyberwitchKitEmail('confirm', brand()).html).toMatch(/text-transform:uppercase;color:#0D1112;text-decoration:none/)
    for (const a of Object.values(CYBERWITCH_ACCENTS)) expect(contrastRatio(CYBERWITCH_ON_ACCENT, a.accent)).toBeGreaterThanOrEqual(4.5)
  })

  it('follows the corners', () => {
    const sq = cyberwitchKitEmail('welcome', brand({ corners: 'square' })).html
    expect(sq).toContain('border-radius:0;')
    expect(sq).not.toContain('border-radius:999px')
    expect(cyberwitchKitEmail('welcome', brand({ corners: 'subtle' })).html).toContain('border-radius:10px')
    expect(cyberwitchKitEmail('welcome', brand()).html).toContain('border-radius:20px')
  })

  it('holds without web fonts: every face has a fallback', () => {
    const { html } = cyberwitchKitEmail('confirm', brand())
    expect(html).toContain("UnifrakturCook, 'Old English Text MT', Georgia, serif")
    expect(html).toContain("'Permanent Marker', 'Marker Felt', Georgia, cursive")
    expect(html).toContain("Spectral, Georgia, 'Times New Roman', serif")
  })

  it('escapes what a Space owner types and refuses a script link', () => {
    const e = cyberwitchKitEmail('confirm', brand({ siteUrl: 'javascript:alert(1)' }), { ctaUrl: 'javascript:alert(2)' })
    expect(e.html).toContain('Ash &lt;Studio&gt;')
    expect(e.html).not.toContain('javascript:')
  })

  it('uses the Space facts and lists the rows it is given', () => {
    const post = cyberwitchKitEmail('post', brand(), { rows })
    expect(post.subject).toBe('First reading tips')
    expect(post.html).toContain('A week on the job')
    const receipt = cyberwitchKitEmail('receipt', brand(), { service: { name: 'Full reading', meta: 'One hour', price: '$90' }, when: 'Nov 6' })
    expect(receipt.html).toContain('Full reading')
    expect(receipt.html).toContain('$90')
  })

  it('keeps the voice: no cadence promise, no em dash', () => {
    for (const t of CYBERWITCH_EMAIL_TYPES) {
      const e = cyberwitchKitEmail(t, brand(), { rows })
      const copy = `${e.subject}\n${e.text}`
      expect(copy, t).not.toMatch(/[–—]/)
      expect(copy, t).not.toMatch(/\bevery (monday|tuesday|wednesday|thursday|friday|saturday|sunday|week)\b|one (email|letter) a week|\bmost weeks\b|\bunlock|within one business day/i)
    }
  })
})
