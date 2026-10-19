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

  it('header is the logo and the brand name, no Frequency masthead', () => {
    const { html } = renderReplyEmail('Hello', 'Dana', BRAND)
    expect(html).toContain('<img src="https://cdn.test/logo.png" alt="Riverside Makers"')
    expect(html).toContain('max-height:40px')
    expect(html).toContain('color:#0a7f5a">Riverside Makers</div>')
    expect(html).not.toContain(SITE_TAGLINE)
    expect(html).not.toContain(`>${SITE_NAME}</div>`)
  })

  it('without a logo or accent: the name alone in the default ink', () => {
    const { html } = renderReplyEmail('Hello', null, { ...BRAND, logoUrl: null, accent: null })
    expect(html).not.toContain('<img')
    expect(html).toContain(`color:${palette.text}">Riverside Makers</div>`)
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
