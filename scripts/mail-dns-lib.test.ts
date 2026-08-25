import { describe, it, expect } from 'vitest'
import { isHostOrSubdomainOf, rsaBits } from './mail-dns-lib.mjs'

// ── The hole CodeQL found in this checker, pinned ──────────────────────────────────────────────
//
// The first version of check-mail-dns.mjs matched hosts with regexes: `/amazonses\.com$/` and a
// `new RegExp(\`include:${target}\\b\`)` built from a string. CodeQL alert 250 called it (missing
// regular expression anchor) on the PR that introduced it, and it was right — an unanchored host
// pattern makes this checker report a HOSTILE sender as authorised, which is worse than having no
// checker at all. Every case below is a string the old regexes accepted.
describe('isHostOrSubdomainOf', () => {
  it('accepts the domain itself and real subdomains', () => {
    expect(isHostOrSubdomainOf('amazonses.com', 'amazonses.com')).toBe(true)
    expect(isHostOrSubdomainOf('feedback-smtp.us-east-1.amazonses.com', 'amazonses.com')).toBe(true)
    expect(isHostOrSubdomainOf('AMAZONSES.COM', 'amazonses.com')).toBe(true)
    expect(isHostOrSubdomainOf('amazonses.com.', 'amazonses.com')).toBe(true) // trailing root dot
  })

  it('🔴 REFUSES a lookalike registered by someone else', () => {
    // `/amazonses\.com$/` matched every one of these.
    expect(isHostOrSubdomainOf('evil-amazonses.com', 'amazonses.com')).toBe(false)
    expect(isHostOrSubdomainOf('notamazonses.com', 'amazonses.com')).toBe(false)
    expect(isHostOrSubdomainOf('xamazonses.com', 'amazonses.com')).toBe(false)
  })

  it('🔴 REFUSES a suffix that only CONTAINS the domain', () => {
    // The unanchored include: search matched this one — an attacker-controlled domain that merely
    // has amazonses.com as a prefix of its own name.
    expect(isHostOrSubdomainOf('amazonses.com.attacker.example', 'amazonses.com')).toBe(false)
    expect(isHostOrSubdomainOf('mail.amazonses.com.evil.test', 'amazonses.com')).toBe(false)
  })

  it('is total on junk rather than throwing', () => {
    expect(isHostOrSubdomainOf('', 'amazonses.com')).toBe(false)
    expect(isHostOrSubdomainOf('.', 'amazonses.com')).toBe(false)
  })
})

describe('rsaBits', () => {
  // The production Resend key and the production Google Workspace key, verbatim from DNS. These
  // pin the DERIVATION rather than the base64 prefix: the earlier reading identified strength from
  // the leading characters, which is a fingerprint and not a measurement.
  const RESEND_1024 =
    'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDOZZhI2VhN75b6VI7IbOYlZ40JpXOx2plnK6zXwZDx7x/MtMoDPGXi' +
    'ZTWAzYPAHzqywEA2VE6jvmc8G+r8L0W2bkzhYTALuJsniai+33I+ocQT1LvAd4ej1AtedKMN8LD1gc6dBEV2z/Ik4wOM' +
    'IX5oVDA0J7YvzxHboKP/Zp6lCQIDAQAB'

  it('derives 1024 from the live Resend key', () => {
    expect(rsaBits(RESEND_1024)).toBe(1024)
  })

  it('returns null on junk rather than guessing', () => {
    expect(rsaBits('not-base64-at-all!!')).toBeNull()
    expect(rsaBits('')).toBeNull()
  })
})
