import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/lib/spaces/accent'
import { SERVICES_ACCENTS, SERVICES_ON_ACCENT } from '@/lib/theme/services'
import { SERVICES_EMAIL_TYPES, servicesKitEmail, type ServicesKitEmailBrand } from '@/lib/theme/services-kit-email'

// The Services kit's eleven emails: email-safe markup, the register, accent, type voice and corners as literals,
// ink on the accent button, the design's faces with fallbacks, escaped input, and the voice rules.

const brand = (over: Partial<ServicesKitEmailBrand> = {}): ServicesKitEmailBrand => ({
  name: 'Harbor <Home>',
  descriptor: 'Home repair',
  owner: 'Sam Ortega',
  role: 'Owner',
  city: 'San Diego',
  phone: '555-0100',
  postalLine: '1 Main Street, San Diego, CA 92101',
  siteUrl: 'https://harborhome.example',
  siteLabel: 'harborhome.example',
  unsubscribeUrl: 'https://harborhome.example/unsubscribe',
  ...over,
})
const rows = [
  { lead: 'Guide', title: 'First visit tips', sub: '4 min read' },
  { lead: 'Story', title: 'A week on the job', sub: '3 min read' },
]

describe('the Services kit emails', () => {
  it('builds all eleven with a subject, html and text', () => {
    expect(SERVICES_EMAIL_TYPES).toHaveLength(11)
    for (const t of SERVICES_EMAIL_TYPES) {
      const e = servicesKitEmail(t, brand(), { rows })
      expect(e.subject, t).toMatch(/\S/)
      expect(e.html, t).toContain('<table')
      expect(e.text, t).toContain('Unsubscribe')
      expect(e.html, t).not.toMatch(/\b(undefined|null|NaN)\b/)
      expect(e.html, t).not.toMatch(/<script|<form|position:\s*absolute|display:\s*flex|display:\s*grid/i)
      expect(e.html, t).not.toContain('var(--')
    }
  })

  it('follows the register and the accent as literals', () => {
    const night = servicesKitEmail('confirm', brand({ accent: 'ember' }))
    expect(night.html).toContain('#0B0F13')
    expect(night.html).toContain(SERVICES_ACCENTS.ember.accent)
    const dayMail = servicesKitEmail('confirm', brand({ register: 'day', accent: 'fern' }))
    expect(dayMail.html).toContain('#F5F1EA')
    expect(dayMail.html).toContain(SERVICES_ACCENTS.fern.accent)
    expect(servicesKitEmail('confirm', brand({ accent: 'nope' })).html).toContain(SERVICES_ACCENTS.tide.accent)
  })

  it('puts ink on the filled accent button, never white', () => {
    const e = servicesKitEmail('confirm', brand())
    expect(e.html).toContain(`color:${SERVICES_ON_ACCENT}`)
    for (const a of Object.values(SERVICES_ACCENTS)) expect(contrastRatio(SERVICES_ON_ACCENT, a.accent)).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps accent text readable in both registers', () => {
    for (const a of Object.keys(SERVICES_ACCENTS)) {
      for (const register of ['night', 'day'] as const) {
        const html = servicesKitEmail('welcome', brand({ accent: a, register })).html
        const bg = register === 'day' ? '#F5F1EA' : '#0B0F13'
        const m = html.match(/letter-spacing:\.18em;text-transform:uppercase;color:(#[0-9A-Fa-f]{6})/)
        expect(contrastRatio(m![1], bg), `${a} ${register}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('follows the type voice and the corners', () => {
    expect(servicesKitEmail('confirm', brand({ type: 'caps' })).html).toContain('text-transform:uppercase;color:#F5F6F7')
    expect(servicesKitEmail('confirm', brand({ type: 'quiet' })).html).toContain('font-weight:300')
    expect(servicesKitEmail('confirm', brand({ type: 'editorial' })).html).toContain('font:500 40px/1.02 Lora')
    const sq = servicesKitEmail('welcome', brand({ corners: 'square' })).html
    expect(sq).toContain('border-radius:0;')
    expect(sq).not.toContain('border-radius:999px')
    expect(servicesKitEmail('welcome', brand({ corners: 'subtle' })).html).toContain('border-radius:10px')
    expect(servicesKitEmail('welcome', brand()).html).toContain('border-radius:20px')
  })

  it('holds without web fonts: every face has a fallback', () => {
    const { html } = servicesKitEmail('confirm', brand())
    expect(html).toContain("'Bricolage Grotesque', Helvetica, Arial, sans-serif")
    expect(html).toContain('Lora, Georgia, serif')
    expect(html).toContain("'DM Mono', Menlo, monospace")
  })

  it('escapes what a Space owner types and refuses a script link', () => {
    const e = servicesKitEmail('confirm', brand({ siteUrl: 'javascript:alert(1)' }), { ctaUrl: 'javascript:alert(2)' })
    expect(e.html).toContain('Harbor &lt;Home&gt;')
    expect(e.html).not.toContain('javascript:')
  })

  it('uses the Space facts and lists the rows it is given', () => {
    const post = servicesKitEmail('post', brand(), { rows })
    expect(post.subject).toBe('First visit tips')
    expect(post.html).toContain('A week on the job')
    const receipt = servicesKitEmail('receipt', brand(), { service: { name: 'Deep clean', meta: 'Two rooms', price: '$90' }, when: 'Nov 6' })
    expect(receipt.html).toContain('Deep clean')
    expect(receipt.html).toContain('$90')
  })

  it('keeps the voice: no cadence promise, no em dash, no violet', () => {
    for (const t of SERVICES_EMAIL_TYPES) {
      const e = servicesKitEmail(t, brand(), { rows })
      const copy = `${e.subject}\n${e.text}`
      expect(copy, t).not.toMatch(/[–—]/)
      expect(copy, t).not.toMatch(/\bevery (monday|tuesday|wednesday|thursday|friday|saturday|sunday|week)\b|one (email|letter) a week|\bmost weeks\b|\bunlock|within one business day/i)
      expect(e.html.toLowerCase(), t).not.toContain('#5b3fd0')
    }
  })
})
