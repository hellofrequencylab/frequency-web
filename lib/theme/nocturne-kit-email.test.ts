import { describe, expect, it } from 'vitest'
import { MIDNIGHT_PALETTE } from '@/lib/theme/midnight'
import { NOCTURNE_KITS } from '@/lib/themes/nocturne-feature-data'
import {
  NOCTURNE_EMAIL_PALETTE,
  nocturneEmailKit,
  nocturneKitDatesEmail,
  nocturneKitNoteEmail,
  nocturneKitReceiptEmail,
  nocturneKitWelcomeEmail,
  type NocturneKitEmailBrand,
} from '@/lib/theme/nocturne-kit-email'

// The Nocturne kit's four emails: email-safe markup, the letter's own night palette and the kit's accent as
// literals, the kit's display face with a Georgia fallback, escaped input, and the voice rules (no weekly promise,
// no em dash) in the words the kit adds.

const brand = (profile: string): NocturneKitEmailBrand => ({
  profile,
  spaceName: 'Lantern <Hall>',
  mastheadNote: 'Evenings',
  city: 'Asheville',
  postalLine: '1 Main Street, Asheville, NC 28801',
  siteUrl: 'https://lanternhall.example',
  siteLabel: 'lanternhall.example',
  unsubscribeUrl: 'https://lanternhall.example/unsubscribe',
  manageUrl: 'https://lanternhall.example/manage',
})
const dates = [{ lead: '20', title: 'Full moon listening', sub: '8:00 PM' }]

function all(profile = 'general') {
  const b = brand(profile)
  return {
    note: nocturneKitNoteEmail(b, { subject: 'A note', title: 'Hello', em: 'there.', lead: 'Lead.', ctaLabel: 'Go', ctaUrl: 'https://lanternhall.example', coverUrl: 'https://lanternhall.example/c.jpg', feature: { kicker: 'K', title: 'T', rows: dates, ctaLabel: 'More', ctaUrl: 'https://lanternhall.example' }, quote: { text: 'Nice.', who: 'Maya', role: 'Guest' } }),
    welcome: nocturneKitWelcomeEmail(b, { ctaLabel: 'Go', ctaUrl: 'https://lanternhall.example', steps: [{ title: 'A', sub: 'a' }, { title: 'B', sub: 'b' }, { title: 'C', sub: 'c' }] }),
    dates: nocturneKitDatesEmail(b, { dates, ctaUrl: 'https://lanternhall.example' }),
    receipt: nocturneKitReceiptEmail(b, { what: 'Listening room', when: 'Thursday', where: 'The back room', who: 'One place', whoNote: 'Reserved', paid: '$25', paidNote: 'No. 1', calendarUrl: 'https://lanternhall.example/a.ics', manageUrl: 'https://lanternhall.example/b' }),
  }
}

describe('the Nocturne kit emails', () => {
  it('builds four emails with a subject, html and text', () => {
    for (const [id, e] of Object.entries(all())) {
      expect(e.subject, id).toMatch(/\S/)
      expect(e.html, id).toContain('<table')
      expect(e.text, id).toContain('Unsubscribe')
      expect(e.html, id).not.toMatch(/\b(undefined|null|NaN)\b/)
    }
  })

  it('wears the letter palette and each kit accent as literals', () => {
    for (const kit of NOCTURNE_KITS) {
      const { note } = all(kit.id)
      for (const hex of [NOCTURNE_EMAIL_PALETTE.ink, NOCTURNE_EMAIL_PALETTE.card, NOCTURNE_EMAIL_PALETTE.bone, NOCTURNE_EMAIL_PALETTE.muted, NOCTURNE_EMAIL_PALETTE.hair, MIDNIGHT_PALETTE.black100, kit.hex]) expect(note.html, kit.id).toContain(hex)
      expect(note.html, kit.id).toContain(`'${kit.fonts.display}', Georgia, 'Times New Roman', serif`)
      expect(note.html).not.toContain('var(--')
    }
  })

  it('puts the night ink on the accent button, and italic or upright accent words as the kit sets', () => {
    expect(all('general').note.html).toContain(`color:${NOCTURNE_EMAIL_PALETTE.ink};text-decoration:none`)
    expect(all('general').note.html).toContain(`color:${nocturneEmailKit('general').hex};font-style:italic`)
    expect(all('studios').note.html).toContain(`color:${nocturneEmailKit('studios').hex};font-style:normal`)
  })

  it('follows the kit corners: square stays square, soft rounds the button', () => {
    expect(all('general').note.html).toContain('border-radius:0px;text-align:center')
    expect(all('coaches').note.html).toContain('border-radius:4px;text-align:center')
    expect(all('studios').note.html).toContain('border-radius:999px;text-align:center')
  })

  it('holds in a client without web fonts: every face has a fallback', () => {
    const { note } = all()
    expect(note.html).toContain("'Bodoni Moda', Georgia, 'Times New Roman', serif")
    expect(note.html).toContain('Helvetica, Arial, sans-serif')
    expect(note.html).not.toMatch(/<script|<form|position:\s*absolute|display:\s*flex|display:\s*grid/i)
  })

  it('escapes what a Space owner types and refuses a script link', () => {
    const e = nocturneKitDatesEmail({ ...brand('general'), siteUrl: 'javascript:alert(1)' }, { dates, ctaUrl: 'https://lanternhall.example' })
    expect(e.html).toContain('Lantern &lt;Hall&gt;')
    expect(e.html).not.toContain('javascript:')
  })

  it('falls back to the general kit for a profile it does not know', () => {
    expect(nocturneEmailKit('nope').id).toBe('general')
    expect(all('nope').note.html).toContain(nocturneEmailKit('general').hex)
  })

  it('keeps the voice: no weekly promise, no em dash', () => {
    for (const [id, e] of Object.entries(all())) {
      const copy = `${e.subject}\n${e.text}`
      expect(copy, id).not.toMatch(/[–—]/)
      expect(copy, id).not.toMatch(/\bevery (monday|tuesday|wednesday|thursday|friday|saturday|sunday|week)\b|one (email|letter) a week|\bmost weeks\b|\bunlock/i)
    }
  })
})
