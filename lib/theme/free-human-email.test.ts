import { describe, expect, it } from 'vitest'
import { FREE_HUMAN_PALETTE, FREE_HUMAN_PROFILES } from '@/lib/theme/free-human'
import {
  freeHumanDatesEmail,
  freeHumanNoteEmail,
  freeHumanReceiptEmail,
  freeHumanWelcomeEmail,
  type FreeHumanEmailBrand,
} from '@/lib/theme/free-human-email'

// The Free Human kit's four emails: email-safe markup, the kit's own palette and the profile's accent as literals, the
// design's faces with fallbacks, escaped input, and the voice rules (no weekly promise, no em dash) in the words
// the kit adds.

const brand = (profile: string): FreeHumanEmailBrand => ({
  profile,
  spaceName: 'Olive <House>',
  mastheadNote: 'Gatherings',
  postalLine: '1 Main Street, Ojai, CA 93023',
  siteUrl: 'https://olivehouse.example',
  siteLabel: 'olivehouse.example',
  unsubscribeUrl: 'https://olivehouse.example/unsubscribe',
  manageUrl: 'https://olivehouse.example/manage',
})
const dates = [{ lead: '20', title: 'New moon sound bath', sub: '7:00 PM' }]

function all(profile = 'general') {
  const b = brand(profile)
  return {
    note: freeHumanNoteEmail(b, { subject: 'A note', title: 'Hello', em: 'there.', lead: 'Lead.', ctaLabel: 'Go', ctaUrl: 'https://olivehouse.example', coverUrl: 'https://olivehouse.example/c.jpg', feature: { kicker: 'K', title: 'T', rows: dates, ctaLabel: 'More', ctaUrl: 'https://olivehouse.example' }, quote: { text: 'Nice.', who: 'Maya', role: 'Guest' } }),
    welcome: freeHumanWelcomeEmail(b, { ctaLabel: 'Go', ctaUrl: 'https://olivehouse.example', steps: [{ title: 'A', sub: 'a' }, { title: 'B', sub: 'b' }, { title: 'C', sub: 'c' }] }),
    dates: freeHumanDatesEmail(b, { dates, ctaUrl: 'https://olivehouse.example' }),
    receipt: freeHumanReceiptEmail(b, { what: 'Sound bath', when: 'Thursday', where: 'Great room', who: 'One place', whoNote: 'Reserved', paid: '$45', paidNote: 'No. 1', calendarUrl: 'https://olivehouse.example/a.ics', manageUrl: 'https://olivehouse.example/b' }),
  }
}

describe('the Free Human kit emails', () => {
  it('builds four emails with a subject, html and text', () => {
    for (const [id, e] of Object.entries(all())) {
      expect(e.subject, id).toMatch(/\S/)
      expect(e.html, id).toContain('<table')
      expect(e.text, id).toContain('Unsubscribe')
      expect(e.html, id).not.toMatch(/\b(undefined|null|NaN)\b/)
    }
  })

  it('wears the kit palette and each profile accent as literals', () => {
    for (const id of Object.keys(FREE_HUMAN_PROFILES) as (keyof typeof FREE_HUMAN_PROFILES)[]) {
      const { note } = all(id)
      for (const hex of [FREE_HUMAN_PALETTE.linen200, FREE_HUMAN_PALETTE.cream50, FREE_HUMAN_PALETTE.ink900, FREE_HUMAN_PROFILES[id].accent]) expect(note.html, id).toContain(hex)
      expect(note.html).not.toContain('var(--')
    }
  })

  it('reads the label on the button: cream on madder, ink where it reads better', () => {
    expect(all('general').note.html).toContain(`color:${FREE_HUMAN_PROFILES.general.on}`)
    expect(all('markets').note.html).toContain(`color:${FREE_HUMAN_PALETTE.ink900};text-decoration:none`)
  })

  it('holds in a client without web fonts: every face has a fallback', () => {
    const { note } = all()
    expect(note.html).toContain("'Cormorant Garamond', Georgia, 'Times New Roman', serif")
    expect(note.html).toContain("'Hanken Grotesk', Helvetica, Arial, sans-serif")
    expect(note.html).not.toMatch(/<script|<form|position:\s*absolute|display:\s*flex|display:\s*grid/i)
  })

  it('escapes what a Space owner types and refuses a script link', () => {
    const e = freeHumanDatesEmail({ ...brand('general'), siteUrl: 'javascript:alert(1)' }, { dates, ctaUrl: 'https://olivehouse.example' })
    expect(e.html).toContain('Olive &lt;House&gt;')
    expect(e.html).not.toContain('javascript:')
  })

  it('falls back to the madder for a profile it does not know', () => {
    expect(all('nope').note.html).toContain(FREE_HUMAN_PROFILES.general.accent)
  })

  it('keeps the voice: no weekly promise, no em dash, no violet', () => {
    for (const [id, e] of Object.entries(all())) {
      const copy = `${e.subject}\n${e.text}`
      expect(copy, id).not.toMatch(/[–—]/)
      expect(copy, id).not.toMatch(/\bevery (monday|tuesday|wednesday|thursday|friday|saturday|sunday|week)\b|one (email|letter) a week|\bmost weeks\b|\bunlock/i)
      expect(e.html.toLowerCase(), id).not.toContain('#5b3fd0')
    }
  })
})
