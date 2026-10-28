import { describe, expect, it } from 'vitest'
import { NETWORK_KIT_SCHEMES, NETWORK_KIT_SCHEME_ORDER } from '@/lib/theme/network-kit'
import {
  networkKitDatesEmail,
  networkKitNoteEmail,
  networkKitReceiptEmail,
  networkKitWelcomeEmail,
  type NetworkKitEmailBrand,
} from '@/lib/theme/network-kit-email'

// The Network kit's four emails: email-safe markup, the scheme's own colours, the design's faces with
// fallbacks, escaped input, and the voice rules (no weekly promise, no em dash) in the words the kit adds.

const brand = (profile: string): NetworkKitEmailBrand => ({
  profile,
  spaceName: 'Table <Nine>',
  mastheadNote: 'Meetups',
  postalLine: '1 Main Street, Austin, TX 78701',
  siteUrl: 'https://tablenine.example',
  siteLabel: 'tablenine.example',
  unsubscribeUrl: 'https://tablenine.example/unsubscribe',
  manageUrl: 'https://tablenine.example/manage',
})
const dates = [{ lead: 'Nov 6', title: 'Friday coffee', sub: '9:00 AM' }]

function all(profile = 'general') {
  const b = brand(profile)
  return {
    note: networkKitNoteEmail(b, { subject: 'A note', title: 'Hello', em: 'there.', lead: 'Lead.', ctaLabel: 'Go', ctaUrl: 'https://tablenine.example', coverUrl: 'https://tablenine.example/c.jpg', feature: { kicker: 'K', title: 'T', rows: dates, ctaLabel: 'More', ctaUrl: 'https://tablenine.example' }, quote: { text: 'Nice.', who: 'Maya', role: 'Member' } }),
    welcome: networkKitWelcomeEmail(b, { ctaLabel: 'Go', ctaUrl: 'https://tablenine.example', steps: [{ title: 'A', sub: 'a' }, { title: 'B', sub: 'b' }, { title: 'C', sub: 'c' }] }),
    dates: networkKitDatesEmail(b, { dates, ctaUrl: 'https://tablenine.example' }),
    receipt: networkKitReceiptEmail(b, { what: 'Friday coffee', when: 'Friday', where: 'Courtyard', who: 'One seat', whoNote: 'Reserved', paid: 'Free', paidNote: 'No. 1', calendarUrl: 'https://tablenine.example/a.ics', manageUrl: 'https://tablenine.example/b' }),
  }
}

describe('the Network kit emails', () => {
  it('builds four emails with a subject, html and text', () => {
    for (const [id, e] of Object.entries(all())) {
      expect(e.subject, id).toMatch(/\S/)
      expect(e.html, id).toContain('<table')
      expect(e.text, id).toContain('Unsubscribe')
      expect(e.html, id).not.toMatch(/\b(undefined|null|NaN)\b/)
    }
  })

  it('wears each scheme: paper, card white, ink and the accent, as literals', () => {
    const profileOf = { marigold: 'general', coral: 'hosts', ocean: 'studios', lagoon: 'coaches' } as const
    for (const id of NETWORK_KIT_SCHEME_ORDER) {
      const S = NETWORK_KIT_SCHEMES[id]
      const { note } = all(profileOf[id])
      for (const hex of [S.paper, S.white, S.ink, S.accent, S.onAccent, S.line]) expect(note.html, id).toContain(hex)
      expect(note.html).not.toContain('var(--')
    }
  })

  it('holds in a client without web fonts: every face has a fallback', () => {
    const { note } = all()
    expect(note.html).toContain("'Bricolage Grotesque', Helvetica, Arial, sans-serif")
    expect(note.html).toContain('Outfit, Helvetica, Arial, sans-serif')
    expect(note.html).toContain("'Instrument Serif', Georgia, serif")
    expect(note.html).not.toMatch(/<script|<form|position:\s*absolute|display:\s*flex|display:\s*grid/i)
  })

  it('escapes what a Space owner types and refuses a script link', () => {
    const e = networkKitDatesEmail({ ...brand('general'), siteUrl: 'javascript:alert(1)' }, { dates, ctaUrl: 'https://tablenine.example' })
    expect(e.html).toContain('Table &lt;Nine&gt;')
    expect(e.html).not.toContain('javascript:')
  })

  it('keeps the voice: no weekly promise, no em dash, no violet', () => {
    for (const [id, e] of Object.entries(all())) {
      const copy = `${e.subject}\n${e.text}`
      expect(copy, id).not.toMatch(/[–—]/)
      expect(copy, id).not.toMatch(/\bevery (monday|tuesday|wednesday|thursday|friday|saturday|sunday|week)\b|one email a week|\bunlock/i)
      expect(e.html.toLowerCase(), id).not.toContain('#5b3fd0')
    }
  })
})
