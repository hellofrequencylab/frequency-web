import { describe, expect, it } from 'vitest'
import { parseTestRecipient } from './test-recipient'

describe('parseTestRecipient', () => {
  it('sends to the operator when the field is blank', () => {
    expect(parseTestRecipient('  ', 'me@example.com')).toEqual({ ok: true, to: 'me@example.com', own: true })
  })
  it('fails when blank and the account has no email', () => {
    expect(parseTestRecipient('', null)).toMatchObject({ ok: false })
  })
  it('accepts one other address and marks it as not the operator', () => {
    expect(parseTestRecipient(' friend@example.org ', 'me@example.com')).toEqual({ ok: true, to: 'friend@example.org', own: false })
  })
  it('treats the operator typing their own address as own, ignoring case', () => {
    expect(parseTestRecipient('ME@example.com', 'me@example.com')).toMatchObject({ ok: true, own: true })
  })
  it('refuses a list, a header injection and a non-address', () => {
    for (const bad of ['a@b.co, c@d.co', 'a@b.co\nBcc: x@y.z', 'not an address', 'a@b']) {
      expect(parseTestRecipient(bad, 'me@example.com')).toMatchObject({ ok: false })
    }
  })
})
