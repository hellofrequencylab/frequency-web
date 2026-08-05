import { describe, it, expect } from 'vitest'
import { renderReplyEmail, renderCoalescedEmail } from './email-template'
import { SITE_TAGLINE } from '@/lib/site'

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
