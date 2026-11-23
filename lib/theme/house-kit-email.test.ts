import { describe, expect, it } from 'vitest'
import { MEGA_SURFACES } from '@/lib/theme/mega-surfaces'
import {
  houseKitDatesEmail,
  houseKitEmailColours,
  houseKitNoteEmail,
  houseKitReceiptEmail,
  houseKitWelcomeEmail,
  type HouseKitEmailBrand,
  type HouseKitEmailTheme,
} from '@/lib/theme/house-kit-email'

// The Bold and Wildheart kits' four emails: email-safe markup, the theme's own flat token set as literals, the
// owner's accent when it is a real pick, escaped input, no dead link and no em dash in the words the kit adds.

const THEMES: HouseKitEmailTheme[] = ['bold', 'wildheart', 'aiden-tyack']
const brand = (theme: HouseKitEmailTheme, accent?: string): HouseKitEmailBrand => ({
  theme,
  accent,
  spaceName: 'Salt <House>',
  mastheadNote: 'Where you meet',
  postalLine: '1 Main Street, Oceanside, CA 92054',
  siteUrl: 'https://salthouse.example',
  siteLabel: 'salthouse.example',
  unsubscribeUrl: 'https://salthouse.example/unsubscribe',
  manageUrl: 'https://salthouse.example/manage',
})
const dates = [{ lead: '20', title: 'Open night', sub: '7:00 PM' }]

function all(theme: HouseKitEmailTheme, accent?: string) {
  const b = brand(theme, accent)
  return {
    note: houseKitNoteEmail(b, { subject: 'A note', title: 'Hello', em: 'there.', lead: 'Lead.', ctaLabel: 'Go', ctaUrl: 'https://salthouse.example', coverUrl: 'https://salthouse.example/c.jpg', feature: { kicker: 'K', title: 'T', rows: dates, ctaLabel: 'More', ctaUrl: 'https://salthouse.example' }, quote: { text: 'Nice.', who: 'Maya', role: 'Guest' } }),
    welcome: houseKitWelcomeEmail(b, { ctaLabel: 'Go', ctaUrl: 'https://salthouse.example', steps: [{ title: 'A', sub: 'a' }, { title: 'B', sub: 'b' }, { title: 'C', sub: 'c' }] }),
    dates: houseKitDatesEmail(b, { dates, ctaUrl: 'https://salthouse.example' }),
    receipt: houseKitReceiptEmail(b, { what: 'Open night', when: 'Thursday', where: 'The hall', who: 'One place', whoNote: 'Reserved', paid: '$25', paidNote: 'No. 1', calendarUrl: 'https://salthouse.example/a.ics', manageUrl: 'https://salthouse.example/b' }),
  }
}

describe('House kit emails (Bold, Wildheart)', () => {
  it('renders all four for each theme as email-safe html with a plain text twin', () => {
    for (const t of THEMES) {
      for (const [k, e] of Object.entries(all(t))) {
        expect(e.subject.length, `${t} ${k}`).toBeGreaterThan(0)
        expect(e.html, `${t} ${k}`).toMatch(/^<!doctype html>/i)
        expect(e.html).toContain('role="presentation"')
        expect(e.html).not.toContain('<script')
        expect(e.html).not.toContain('href="#"')
        expect(e.html).toContain('Salt &lt;House&gt;')
        expect(e.html).not.toContain('Salt <House>')
        expect(e.html).not.toContain('—')
        expect(e.text).toContain('https://salthouse.example/unsubscribe')
        expect(e.text).not.toContain('—')
      }
    }
  })

  it('wears the theme\'s flat token set', () => {
    for (const t of THEMES) {
      const s = MEGA_SURFACES[t]!
      const c = houseKitEmailColours(t)
      expect(c.accent).toBe(s.accent.accent)
      for (const e of Object.values(all(t))) expect(e.html.toLowerCase()).toContain(s.accent.accent.toLowerCase())
    }
  })

  it('takes an owner accent over the theme\'s, and ignores one that is not a hex', () => {
    expect(houseKitEmailColours('bold', '#2a6f97').accent).toBe('#2a6f97')
    expect(houseKitEmailColours('bold', 'red').accent).toBe(MEGA_SURFACES.bold!.accent.accent)
    expect(all('wildheart', '#2a6f97').note.html).toContain('#2a6f97')
  })

  it('sets each theme in its own faces', () => {
    expect(all('bold').note.html).toContain('Sofia Sans Extra Condensed')
    expect(all('bold').note.html).toContain('text-transform:uppercase')
    expect(all('wildheart').note.html).toContain('IM Fell English')
    // Aiden Tyack's blackletter is never set in caps.
    expect(all('aiden-tyack').note.html).toContain('Grenze Gotisch')
    expect(all('aiden-tyack').note.html).toContain("font:700 40px/1.04 'Grenze Gotisch', Georgia, 'Times New Roman', serif;color:")
    expect(all('aiden-tyack').note.html).toContain("font:400 20px/1.4 'Cormorant Garamond'")
  })

  it('never links a script url', () => {
    const e = houseKitNoteEmail(brand('bold'), { subject: 's', title: 't', em: 'e', lead: 'l', ctaLabel: 'Go', ctaUrl: 'javascript:alert(1)', feature: { kicker: 'k', title: 't', ctaLabel: 'c', ctaUrl: 'https://salthouse.example' } })
    expect(e.html).not.toContain('javascript:')
  })

  it('coaches the welcome when the owner has not written a lead', () => {
    expect(all('bold').welcome.html).toContain('Say what a new person gets from being on this list')
  })
})
