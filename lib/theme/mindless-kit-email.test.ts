import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/lib/spaces/accent'
import { MINDLESS_ACCENTS, MINDLESS_ON_ACCENT } from '@/lib/theme/mindless'
import { MINDLESS_EMAIL_TYPES, mindlessKitEmail, type MindlessKitEmailBrand } from '@/lib/theme/mindless-kit-email'

// The Mindless kit's eleven emails: email-safe markup, the Night register, the accent and corners as literals, ink on the accent
// button, the design's faces with fallbacks, escaped input, and the voice rules.

const HEX = { fill: MINDLESS_ACCENTS.yellow.accent, text: MINDLESS_ACCENTS.yellow.text }
const ICE = { fill: MINDLESS_ACCENTS.blue.accent, text: MINDLESS_ACCENTS.blue.text }

const brand = (over: Partial<MindlessKitEmailBrand> = {}): MindlessKitEmailBrand => ({
  name: 'Ash <Studio>',
  descriptor: 'Meditation circles',
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

describe('the Mindless kit emails', () => {
  it('builds all eleven with a subject, html and text', () => {
    expect(MINDLESS_EMAIL_TYPES).toHaveLength(11)
    for (const t of MINDLESS_EMAIL_TYPES) {
      const e = mindlessKitEmail(t, brand(), { rows })
      expect(e.subject, t).toMatch(/\S/)
      expect(e.html, t).toContain('<table')
      expect(e.text, t).toContain('Unsubscribe')
      expect(e.html, t).not.toMatch(/\b(undefined|null|NaN)\b/)
      expect(e.html, t).not.toMatch(/<script|<form|position:\s*absolute|display:\s*flex|display:\s*grid/i)
      expect(e.html, t).not.toContain('var(--')
    }
  })

  it('is the Night register: warm ink page, bone text and the accent as literals', () => {
    const e = mindlessKitEmail('confirm', brand({ accent: ICE }))
    expect(e.html).toContain('#231B1D')
    expect(e.html).toContain('#ECE4E6')
    expect(e.html).toContain(ICE.fill)
    expect(e.html).toContain('dark only')
  })

  it('puts ink on the filled accent button, and every preset reads', () => {
    expect(mindlessKitEmail('confirm', brand()).html).toMatch(/text-transform:uppercase;color:#231B1D;text-decoration:none/)
    expect(mindlessKitEmail('confirm', brand()).html).toContain('border:3px solid #120C0E')
    for (const a of Object.values(MINDLESS_ACCENTS)) expect(contrastRatio(MINDLESS_ON_ACCENT, a.accent)).toBeGreaterThanOrEqual(3.9)
  })

  it('follows the corners', () => {
    const sq = mindlessKitEmail('welcome', brand({ corners: 'square' })).html
    expect(sq).toContain('border-radius:0;')
    expect(sq).not.toContain('border-radius:999px')
    expect(mindlessKitEmail('welcome', brand({ corners: 'subtle' })).html).toContain('border-radius:10px')
    expect(mindlessKitEmail('welcome', brand()).html).toContain('border-radius:20px')
  })

  it('holds without web fonts: every face has a fallback', () => {
    const { html } = mindlessKitEmail('confirm', brand())
    expect(html).toContain("'Rubik Wet Paint', Impact, 'Arial Black', Arial, sans-serif")
    expect(html).toContain("Archivo, 'Helvetica Neue', Arial, sans-serif")
  })

  it('escapes what a Space owner types and refuses a script link', () => {
    const e = mindlessKitEmail('confirm', brand({ siteUrl: 'javascript:alert(1)' }), { ctaUrl: 'javascript:alert(2)' })
    expect(e.html).toContain('Ash &lt;Studio&gt;')
    expect(e.html).not.toContain('javascript:')
  })

  it('uses the Space facts and lists the rows it is given', () => {
    const post = mindlessKitEmail('post', brand(), { rows })
    expect(post.subject).toBe('First reading tips')
    expect(post.html).toContain('A week on the job')
    const receipt = mindlessKitEmail('receipt', brand(), { service: { name: 'Full reading', meta: 'One hour', price: '$90' }, when: 'Nov 6' })
    expect(receipt.html).toContain('Full reading')
    expect(receipt.html).toContain('$90')
  })

  it('keeps the voice: no cadence promise, no em dash', () => {
    for (const t of MINDLESS_EMAIL_TYPES) {
      const e = mindlessKitEmail(t, brand(), { rows })
      const copy = `${e.subject}\n${e.text}`
      expect(copy, t).not.toMatch(/[–—]/)
      expect(copy, t).not.toMatch(/\bevery (monday|tuesday|wednesday|thursday|friday|saturday|sunday|week)\b|one (email|letter) a week|\bmost weeks\b|\bunlock|within one business day/i)
    }
  })
})
