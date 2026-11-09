import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/lib/spaces/accent'
import { NEW_WORLD_EMAIL_TYPES, newWorldKitEmail, newWorldKitEmailFrom, type NewWorldKitEmailBrand } from '@/lib/theme/new-world-kit-email'
import { newWorldKitSpotlightContent } from '@/lib/spotlight/new-world-kit-content'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// The New World kit's eleven emails: email-safe markup, the register, accent, type voice and corners as literals,
// a white label on the accent button, the design's faces with fallbacks, escaped input, and the voice rules.

// Resolved accent steps, as the theme hands them in (a night set and a day set).
const TIDE = { fill: '#1AA7C0', text: '#3FC1D6' }
const TIDE_DAY = { fill: '#0D6074', text: '#0D6074' }
const RED = { fill: '#E5484D', text: '#FF9CA0' }

const brand = (over: Partial<NewWorldKitEmailBrand> = {}): NewWorldKitEmailBrand => ({
  name: 'Harbor <Home>',
  descriptor: 'Home repair',
  accent: TIDE,
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

describe('the New World kit emails', () => {
  it('builds all eleven with a subject, html and text', () => {
    expect(NEW_WORLD_EMAIL_TYPES).toHaveLength(11)
    for (const t of NEW_WORLD_EMAIL_TYPES) {
      const e = newWorldKitEmail(t, brand(), { rows })
      expect(e.subject, t).toMatch(/\S/)
      expect(e.html, t).toContain('<table')
      expect(e.text, t).toContain('Unsubscribe')
      expect(e.html, t).not.toMatch(/\b(undefined|null|NaN)\b/)
      expect(e.html, t).not.toMatch(/<script|<form|position:\s*absolute|display:\s*flex|display:\s*grid/i)
      expect(e.html, t).not.toContain('var(--')
    }
  })

  it('follows the register and the accent as literals', () => {
    const night = newWorldKitEmail('confirm', brand({ accent: RED }))
    expect(night.html).toContain('#0A0E16')
    expect(night.html).toContain(RED.fill)
    const dayMail = newWorldKitEmail('confirm', brand({ register: 'day', accent: TIDE_DAY }))
    expect(dayMail.html).toContain('#34312E')
    expect(dayMail.html).toContain(TIDE_DAY.fill)
  })

  it('puts a white label on the filled accent button on both registers, and ink only on an accent too light for white', () => {
    expect(newWorldKitEmail('confirm', brand()).html).toMatch(/text-transform:uppercase;color:#FFFFFF;text-decoration:none/)
    expect(newWorldKitEmail('confirm', brand({ register: 'day', accent: TIDE_DAY })).html).toMatch(/text-transform:uppercase;color:#FFFFFF;text-decoration:none/)
    expect(contrastRatio('#FFFFFF', TIDE_DAY.fill)).toBeGreaterThanOrEqual(4.5)
    const pale = newWorldKitEmail('confirm', brand({ accent: { fill: '#F2F5FA', text: '#F2F5FA' } })).html
    expect(pale).toMatch(/text-transform:uppercase;color:#0A0E16;text-decoration:none/)
  })

  it('carries the kit words the Spotlight draws: its button, first offer and quote, and no other theme\'s quote', () => {
    const c = newWorldKitSpotlightContent('hosts')
    const k = newWorldKitEmailFrom(c)
    const welcome = newWorldKitEmail('welcome', brand(k.brand), k.facts)
    expect(welcome.html).toContain(esc(c.cta.label))
    expect(welcome.html).toContain(esc(c.quote!.text))
    expect(welcome.html).toContain('Pick a time')
    expect(newWorldKitEmail('confirm', brand(k.brand), k.facts).html).toContain(esc((c.offers[1] ?? c.offers[0])!.name))
    // A template owner reads as the whole placeholder, never "Your reads".
    const tpl = newWorldKitEmailFrom(newWorldKitSpotlightContent('general'))
    expect(newWorldKitEmail('welcome', brand(tpl.brand), tpl.facts).html).toContain('Your name reads every message')
    // No quote given, no quote card: the Services line never lands in a New World email.
    const bare = newWorldKitEmail('welcome', brand())
    expect(bare.html).not.toContain('Do the job right')
    expect(bare.html).not.toContain('From Sam')
  })

  it('follows the type voice and the corners', () => {
    expect(newWorldKitEmail('confirm', brand({ type: 'charge' })).html).toContain('font-style:italic')
    expect(newWorldKitEmail('confirm', brand({ type: 'editorial' })).html).toContain("font:500 40px/1.02 'Instrument Serif'")
    const sq = newWorldKitEmail('welcome', brand({ corners: 'square' }), { quote: 'A line.' }).html
    expect(sq).toContain('border-radius:0;')
    expect(sq).not.toContain('border-radius:999px')
    expect(newWorldKitEmail('welcome', brand({ corners: 'subtle' }), { quote: 'A line.' }).html).toContain('border-radius:10px')
    expect(newWorldKitEmail('welcome', brand(), { quote: 'A line.' }).html).toContain('border-radius:20px')
  })

  it('holds without web fonts: every face has a fallback', () => {
    const { html } = newWorldKitEmail('confirm', brand())
    expect(html).toContain('Unbounded, Helvetica, Arial, sans-serif')
    expect(html).toContain("'Instrument Serif', Georgia, serif")
    expect(html).toContain("'Hanken Grotesk', Helvetica, Arial, sans-serif")
  })

  it('escapes what a Space owner types and refuses a script link', () => {
    const e = newWorldKitEmail('confirm', brand({ siteUrl: 'javascript:alert(1)' }), { ctaUrl: 'javascript:alert(2)' })
    expect(e.html).toContain('Harbor &lt;Home&gt;')
    expect(e.html).not.toContain('javascript:')
  })

  it('uses the Space facts and lists the rows it is given', () => {
    const post = newWorldKitEmail('post', brand(), { rows })
    expect(post.subject).toBe('First visit tips')
    expect(post.html).toContain('A week on the job')
    const receipt = newWorldKitEmail('receipt', brand(), { service: { name: 'Deep clean', meta: 'Two rooms', price: '$90' }, when: 'Nov 6' })
    expect(receipt.html).toContain('Deep clean')
    expect(receipt.html).toContain('$90')
  })

  it('keeps the voice: no cadence promise, no em dash', () => {
    for (const t of NEW_WORLD_EMAIL_TYPES) {
      const e = newWorldKitEmail(t, brand(), { rows })
      const copy = `${e.subject}\n${e.text}`
      expect(copy, t).not.toMatch(/[–—]/)
      expect(copy, t).not.toMatch(/\bevery (monday|tuesday|wednesday|thursday|friday|saturday|sunday|week)\b|one (email|letter) a week|\bmost weeks\b|\bunlock|within one business day/i)
    }
  })
})
