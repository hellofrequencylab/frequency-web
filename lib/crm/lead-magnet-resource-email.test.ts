import { describe, expect, it } from 'vitest'
import { buildLeadMagnetResourceEmail, resourceEmailUrl } from './lead-magnet-resource-email'

const base = { to: 'maya@example.com', resourceUrl: 'https://example.com/guide.pdf?a=1&b=2', label: 'First gathering checklist' }
describe('the one-resource receipt', () => {
  it('uses the standard shell, one requested action and a truthful transactional footer', () => {
    const email = buildLeadMagnetResourceEmail(base)
    expect(email.subject).toBe('Your requested resource')
    expect(email.text).toContain(base.resourceUrl)
    expect(email.html).toContain('https://example.com/guide.pdf?a=1&amp;b=2')
    expect(email.html.match(/Open the resource/g)).toHaveLength(1)
    expect(email.html).toContain('You received this one email because')
    expect(email.html).not.toMatch(/unsubscribe|Join free|\/join|create.a.space|start.a.space/i)
    expect(email).not.toHaveProperty('from')
    expect(Buffer.byteLength(email.html)).toBeLessThan(60_000)
  })
  it('escapes labels and URLs, and keeps user text out of email headers', () => {
    const email = buildLeadMagnetResourceEmail({ ...base, label: 'Tom & "Jerry" <script>\r\nBcc: evil@example.com' })
    expect(email.html).toContain('Tom &amp; &quot;Jerry&quot;')
    expect(email.html).not.toContain('<script>')
    expect(email.subject).not.toMatch(/[\r\n]/)
  })
  it('uses no emoji, banned hype or em dashes in its own copy', () => {
    const email = buildLeadMagnetResourceEmail(base)
    expect([email.subject, email.html, email.text].join('\n')).not.toMatch(/[—–]|unlock|transform your life|guaranteed/)
  })
  for (const unsafe of ['javascript:alert(1)', 'data:text/html,bad', '/relative', 'https://user:password@example.com/file', 'https://example.com/\nfile', '']) it(`refuses unsafe resource ${unsafe}`, () => {
    expect(resourceEmailUrl(unsafe)).toBeNull()
    expect(() => buildLeadMagnetResourceEmail({ ...base, resourceUrl: unsafe })).toThrow('valid resource')
  })
  it('canonicalizes a valid HTTP URL without fetching it', () => {
    expect(resourceEmailUrl('HTTPS://EXAMPLE.COM:443/a')).toBe('https://example.com/a')
    expect(resourceEmailUrl('http://example.com/a')).toBe('http://example.com/a')
  })
})
