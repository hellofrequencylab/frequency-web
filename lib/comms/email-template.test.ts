import { describe, it, expect } from 'vitest'
import { renderReplyEmail, renderCoalescedEmail } from './email-template'

// The branded reply/digest footer is member-facing copy, so it is bound by the voice canon
// (docs/CONTENT-VOICE.md): no em dashes. Guard the plain-text footer against a regression.
describe('branded email footer — voice canon', () => {
  it('renderReplyEmail text has no em dash', () => {
    const { text } = renderReplyEmail('Thanks for reaching out.', 'Dana\nfrequencylocal.com')
    expect(text).not.toContain('—')
    expect(text).toContain('A place to be human')
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
