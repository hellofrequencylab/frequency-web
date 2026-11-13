import { describe, expect, it } from 'vitest'
import { buildContactAckEmail } from './contact-ack-email'

const base = { to: 'maya@example.com', visitorName: 'Maya Chen', spaceName: 'North Light Yoga', slug: 'north-light', baseUrl: 'https://frequencylocal.com/', signedOut: false }

describe('the contact form acknowledgement', () => {
  it('thanks them, names the Space, says what happens next and has one button to the Space page', () => {
    const e = buildContactAckEmail(base)
    expect(e.to).toBe('maya@example.com')
    expect(e.subject).toBe('Thanks for writing to North Light Yoga')
    for (const out of [e.html, e.text]) {
      expect(out).toContain('Hi Maya,')
      expect(out).toContain('North Light Yoga')
      expect(out).toContain('they will reply to you by email')
      expect(out).toContain('https://frequencylocal.com/spaces/north-light')
    }
    expect(e.html.match(/Visit the Space page/g)).toHaveLength(1)
  })

  it('says why they got it, carries no unsubscribe control and no marketing', () => {
    const e = buildContactAckEmail(base)
    expect(e.text).toContain('You are getting this one note because this email address was used on the contact form for North Light Yoga.')
    expect(e.html).not.toMatch(/unsubscribe/i)
  })

  it('adds the join link only for a signed-out visitor', () => {
    expect(buildContactAckEmail(base).text).not.toContain('/join')
    const out = buildContactAckEmail({ ...base, signedOut: true })
    expect(out.text).toContain('Join free: https://frequencylocal.com/join')
    expect(out.html).toContain('href="https://frequencylocal.com/join"')
  })

  it('greets plainly without a name', () => {
    expect(buildContactAckEmail({ ...base, visitorName: null }).text).toContain('Hi,')
    expect(buildContactAckEmail({ ...base, visitorName: '   ' }).text).toContain('Hi,')
  })

  it('escapes visitor and Space strings, and keeps the subject to one plain line', () => {
    const e = buildContactAckEmail({
      ...base,
      visitorName: '<script>alert(1)</script>',
      spaceName: 'Tom & "Jerry" <b>Yoga</b>\nBcc: x@evil.com',
      slug: 'a&b/../x',
    })
    expect(e.html).not.toContain('<script>')
    expect(e.html).not.toContain('<b>Yoga')
    expect(e.html).toContain('Tom &amp; &quot;Jerry&quot;')
    expect(e.html).toContain('a%26b')
    expect(e.subject).not.toMatch(/[\r\n<>]/)
  })

  it('uses no em dashes', () => {
    const e = buildContactAckEmail({ ...base, signedOut: true })
    for (const out of [e.subject, e.html, e.text ?? '']) expect(out).not.toMatch(/[—–]/)
  })
})
