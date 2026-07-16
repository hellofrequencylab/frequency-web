import { describe, it, expect } from 'vitest'
import {
  signLeadLink,
  parseLeadLink,
  makeLeadLinkPayload,
  buildLeadLinkUrl,
  isSafeHttpUrl,
  DOOR_PATHS,
  type LeadLinkPayload,
} from './lead-links'

// The signing secret is resolved from env; give the pure token tests a deterministic one.
process.env.OPTIN_CONFIRM_SECRET = process.env.OPTIN_CONFIRM_SECRET || 'test-lead-link-secret-0123456789'

const future = () => Math.floor(Date.now() / 1000) + 3600
const base: Omit<LeadLinkPayload, 'exp'> = { s: 'space-1', d: 'lead_magnet', l: 'Free guide', r: 'https://example.com/x.pdf' }

describe('lead-link tokens (stateless, signed)', () => {
  it('round-trips a valid payload', () => {
    const payload = makeLeadLinkPayload(base)
    const token = signLeadLink(payload)
    expect(token).toContain('.')
    expect(parseLeadLink(token)).toEqual(payload)
  })

  it('rejects a tampered body (signature no longer matches)', () => {
    const token = signLeadLink(makeLeadLinkPayload(base))
    const [body, sig] = token.split('.')
    // Flip the door in the body: re-encode a different payload but keep the old signature.
    const forged = Buffer.from(JSON.stringify({ ...base, d: 'event', exp: future() })).toString('base64url')
    expect(parseLeadLink(`${forged}.${sig}`)).toBeNull()
    // A garbled signature also fails.
    expect(parseLeadLink(`${body}.${'0'.repeat(32)}`)).toBeNull()
  })

  it('rejects an expired link', () => {
    const expired: LeadLinkPayload = { ...base, exp: Math.floor(Date.now() / 1000) - 10 }
    expect(parseLeadLink(signLeadLink(expired))).toBeNull()
  })

  it('rejects malformed / space_qr / unknown-door tokens', () => {
    expect(parseLeadLink('')).toBeNull()
    expect(parseLeadLink('nodot')).toBeNull()
    expect(parseLeadLink(null)).toBeNull()
    // space_qr has no link surface — a token minted for it must not parse.
    const qr = signLeadLink({ s: 'space-1', d: 'space_qr' as never, exp: future() })
    expect(parseLeadLink(qr)).toBeNull()
  })

  it('builds a public URL on the door path, empty for a door with no link surface', () => {
    const url = buildLeadLinkUrl('https://freq.test/', makeLeadLinkPayload(base))
    expect(url.startsWith(`https://freq.test${DOOR_PATHS.lead_magnet}?t=`)).toBe(true)
    expect(buildLeadLinkUrl('https://freq.test', { s: 's', d: 'space_qr' as never, exp: future() })).toBe('')
  })

  it('validates reveal URLs (http/https only)', () => {
    expect(isSafeHttpUrl('https://example.com/a')).toBe(true)
    expect(isSafeHttpUrl('http://example.com')).toBe(true)
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeHttpUrl('/relative')).toBe(false)
    expect(isSafeHttpUrl('')).toBe(false)
    expect(isSafeHttpUrl(null)).toBe(false)
  })
})
