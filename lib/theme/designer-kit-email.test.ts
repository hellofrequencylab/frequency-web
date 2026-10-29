import { describe, expect, it } from 'vitest'
import { designerKitSpotlightContent } from '@/lib/spotlight/designer-kit-content'
import {
  designerKitDatesEmail,
  designerKitNoteEmail,
  designerKitReceiptEmail,
  designerKitWelcomeEmail,
  type DesignerKitEmailBrand,
} from '@/lib/theme/designer-kit-email'

// The Designer kit's four emails: email-safe markup, the profile's own accent as a literal, the design's faces with
// fallbacks, escaped input, and the voice rules (no cadence promise, no em dash) in the words the kit adds.

const brand = (profile: string): DesignerKitEmailBrand => ({
  profile,
  spaceName: 'Atelier <North>',
  mastheadNote: 'Design',
  postalLine: '1 Mill Street, Austin, TX 78701',
  siteUrl: 'https://ateliernorth.example',
  siteLabel: 'ateliernorth.example',
  unsubscribeUrl: 'https://ateliernorth.example/unsubscribe',
  manageUrl: 'https://ateliernorth.example/manage',
})
const dates = [{ lead: 'Nov 6', title: 'Open studio', sub: '10:00 AM' }]

function all(profile = 'general') {
  const b = brand(profile)
  return {
    note: designerKitNoteEmail(b, { subject: 'A note', title: 'Hello', em: 'there.', lead: 'Lead.', ctaLabel: 'Go', ctaUrl: 'https://ateliernorth.example', coverUrl: 'https://ateliernorth.example/c.jpg', feature: { kicker: 'K', title: 'T', rows: dates, ctaLabel: 'More', ctaUrl: 'https://ateliernorth.example' }, quote: { text: 'Nice.', who: 'Maya', role: 'Client' } }),
    welcome: designerKitWelcomeEmail(b, { ctaLabel: 'Go', ctaUrl: 'https://ateliernorth.example', steps: [{ title: 'A', sub: 'a' }, { title: 'B', sub: 'b' }, { title: 'C', sub: 'c' }] }),
    dates: designerKitDatesEmail(b, { dates, ctaUrl: 'https://ateliernorth.example' }),
    receipt: designerKitReceiptEmail(b, { what: 'Open studio', when: 'Friday', where: 'Workshop', who: 'One place', whoNote: 'Reserved', paid: 'Free', paidNote: 'No. 1', calendarUrl: 'https://ateliernorth.example/a.ics', manageUrl: 'https://ateliernorth.example/b' }),
  }
}

describe('the Designer kit emails', () => {
  it('builds four emails with a subject, html and text', () => {
    for (const [id, e] of Object.entries(all())) {
      expect(e.subject, id).toMatch(/\S/)
      expect(e.html, id).toContain('<table')
      expect(e.text, id).toContain('Unsubscribe')
      expect(e.html, id).not.toMatch(/\b(undefined|null|NaN)\b/)
    }
  })

  it("wears each profile's own accent as a literal", () => {
    for (const profile of ['general', 'coaches', 'studios', 'markets']) {
      const a = designerKitSpotlightContent(profile, { sample: false }).accent
      const { note } = all(profile)
      expect(note.html, profile).toContain(a.base)
      expect(note.html, profile).toContain(a.text)
      expect(note.html).not.toContain('var(--')
    }
  })

  it('holds in a client without web fonts: every face has a fallback', () => {
    const { note } = all()
    expect(note.html).toContain("Cormorant, Georgia, 'Times New Roman', serif")
    expect(note.html).toContain('Jost, Futura, Helvetica, Arial, sans-serif')
    expect(note.html).not.toMatch(/<script|<form|position:\s*absolute|display:\s*flex|display:\s*grid/i)
  })

  it('escapes what a Space owner types and refuses a script link', () => {
    const e = designerKitDatesEmail({ ...brand('general'), siteUrl: 'javascript:alert(1)' }, { dates, ctaUrl: 'https://ateliernorth.example' })
    expect(e.html).toContain('Atelier &lt;North&gt;')
    expect(e.html).not.toContain('javascript:')
  })

  it('keeps the voice: no cadence promise, no em dash, no violet', () => {
    for (const [id, e] of Object.entries(all())) {
      const copy = `${e.subject}\n${e.text}`
      expect(copy, id).not.toMatch(/[–—]/)
      expect(copy, id).not.toMatch(/\bevery (monday|tuesday|wednesday|thursday|friday|saturday|sunday|week)\b|one email a week|most weeks|once a season|\bunlock/i)
      expect(e.html.toLowerCase(), id).not.toContain('#5b3fd0')
    }
  })
})
