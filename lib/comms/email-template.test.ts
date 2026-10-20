import { describe, it, expect } from 'vitest'
import { palette } from '@/lib/theme/palette'
import { renderReplyEmail, renderCoalescedEmail, wrapEmailHtml } from './email-template'
import { SITE_NAME, SITE_TAGLINE } from '@/lib/site'
import type { EmailBrand } from './email-brand'

// The branded reply/digest footer is member-facing copy, so it is bound by the voice canon
// (docs/CONTENT-VOICE.md): no em dashes. Guard the plain-text footer against a regression.
describe('branded email footer — voice canon', () => {
  it('renderReplyEmail text has no em dash', () => {
    const { text } = renderReplyEmail('Thanks for reaching out.', 'Dana\nfrequencylocal.com')
    expect(text).not.toContain('—')
    // Was `toContain('A place to be human')` -- a test PINNING the retired tagline that
    // scripts/check-canon.mjs bans. One CI job required the string another forbade, and the
    // test won because it ran against code the canon gate does not scan. Assert the CANON
    // now, so the two agree by construction.
    expect(text).toContain(SITE_TAGLINE)
    expect(text).not.toMatch(/a place to be human/i)
  })

  it('renderCoalescedEmail text has no em dash', () => {
    const { text } = renderCoalescedEmail('one\n\ntwo', '<p>one</p><p>two</p>', null)
    expect(text).not.toContain('—')
  })

  it('keeps the signature delimiter and body', () => {
    const { text } = renderReplyEmail('Hi there', 'Dana')
    expect(text).toContain('Hi there')
    expect(text).toContain('\n-- \nDana')
  })
})

// Owner ruling 2026-10-12, on a real Space email ("that email looks like trash. How do we mask that."):
// a message a Space sends wears the Space's brand; Frequency is a small "Sent with" line.
describe('Space brand (owner ruling 2026-10-12)', () => {
  const BRAND: EmailBrand = {
    name: 'Riverside Makers',
    logoUrl: 'https://cdn.test/logo.png',
    accent: '#0a7f5a',
    url: 'https://frequencylocal.com/spaces/riverside-makers',
  }

  it('header is the brand name, no Frequency masthead; the logo is the round avatar in the signature card', () => {
    const { html } = renderReplyEmail('Hello', 'Dana', BRAND)
    expect(html).toContain('color:#0a7f5a">Riverside Makers</div>')
    // Owner ask 2026-10-20: the Frequency wordmark sits top left and links to the home feed; a small one
    // closes the footer. The card itself is headed by the Space, not by a Frequency masthead.
    expect(html.indexOf('href="https://frequencylocal.com/feed"')).toBeLessThan(html.indexOf('Riverside Makers</div>'))
    expect(html).not.toContain(`>${SITE_NAME}</div>`)
    // Owner ask 2026-10-20: the profile picture is a circle to the left of the signature.
    expect(html).toContain('<img src="https://cdn.test/logo.png" alt="Riverside Makers" width="52" height="52"')
    expect(html).toContain('border-radius:50%')
    const avatar = html.indexOf('<img src="https://cdn.test/logo.png"')
    expect(avatar).toBeLessThan(html.indexOf('Dana'))
    expect(avatar).toBeGreaterThan(html.indexOf('Hello'))
  })

  it('a Space with a logo and no signature still gets the card, named by the Space', () => {
    const { html } = renderReplyEmail('Hello', null, BRAND)
    expect(html).toContain('<img src="https://cdn.test/logo.png"')
    expect(html).toContain('>Riverside Makers</div></td>')
  })

  it('the card sits on the Frequency page: wash, raised radius-24 card, body ink from the palette', () => {
    const { html } = renderReplyEmail('Hello', 'Dana', BRAND)
    expect(html).toContain('border-radius:24px')
    expect(html).toContain(`background:${palette.surface}`)
    expect(html).toContain(`color:${palette.emailBody}`)
  })

  it('the footer carries the shared legal lines: Privacy, Terms, Help, Manage emails, copyright and the postal line', () => {
    const { html, text } = renderReplyEmail('Hello', null, BRAND)
    for (const path of ['/privacy', '/terms', '/help', '/manage-emails']) {
      expect(html).toContain(`href="https://frequencylocal.com${path}"`)
      expect(text).toContain(`https://frequencylocal.com${path}`)
    }
    expect(html).toContain(`&copy; ${new Date().getFullYear()} Frequency Labs Holdings`)
    expect(html).toContain('Carlsbad, CA')
    expect(text).toContain('Carlsbad, CA')
    expect(text).not.toContain('—')
    expect(html).not.toContain('—')
  })

  it('the footer carries the Frequency mark with Community Collective and a link back to the Space page', () => {
    const { html } = renderReplyEmail('Hello', null, BRAND)
    expect(html).toContain(`alt="${SITE_NAME} ${SITE_TAGLINE}"`)
    expect(html).toContain(`>Back to Riverside Makers on ${SITE_NAME}</a>`)
    expect(html).toContain('href="https://frequencylocal.com/spaces/riverside-makers" style="color:')
  })

  it('without a logo or accent: the name alone in the heading ink, no avatar', () => {
    const { html } = renderReplyEmail('Hello', null, { ...BRAND, logoUrl: null, accent: null })
    expect(html).not.toContain('border-radius:50%')
    expect(html).toContain(`color:${palette.emailHeading}">Riverside Makers</div>`)
  })

  it('footer is one small "Sent with Frequency" line plus the Space page, in html and text', () => {
    const { html, text } = renderReplyEmail('Hello', null, BRAND)
    expect(html).toContain(`>Sent with ${SITE_NAME}</a>`)
    expect(html).toContain('href="https://frequencylocal.com/spaces/riverside-makers"')
    expect(text).toContain(`Sent with ${SITE_NAME}`)
    expect(text).toContain('Riverside Makers · https://frequencylocal.com/spaces/riverside-makers')
    expect(text).not.toContain('—')
    expect(html).not.toContain('—')
  })

  it('escapes brand data', () => {
    const { html } = renderReplyEmail('Hello', null, { ...BRAND, name: 'A <b> & "C"', logoUrl: 'https://cdn.test/a"b.png' })
    expect(html).not.toContain('<b>')
    expect(html).toContain('A &lt;b&gt; &amp; &quot;C&quot;')
    expect(html).toContain('src="https://cdn.test/a&quot;b.png"')
  })

  it('the coalesced batch email wears the brand too', () => {
    const { html, text } = renderCoalescedEmail('one', '<p>one</p>', 'Dana', BRAND)
    expect(html).toContain('Riverside Makers')
    expect(html).toContain(`Sent with ${SITE_NAME}`)
    expect(text).toContain(`Sent with ${SITE_NAME}`)
  })

  it('platform mail (no brand) is unchanged', () => {
    expect(renderReplyEmail('Hello', 'Dana', null)).toEqual(renderReplyEmail('Hello', 'Dana'))
    expect(renderCoalescedEmail('one', '<p>one</p>', null, undefined)).toEqual(renderCoalescedEmail('one', '<p>one</p>', null))
    expect(wrapEmailHtml('<p>x</p>', null)).toBe(wrapEmailHtml('<p>x</p>'))
    expect(wrapEmailHtml('<p>x</p>')).toContain(SITE_TAGLINE)
  })
})
