import { describe, expect, it } from 'vitest'
import { isCrawler, issueClaimToken, resolvePlacement, safeContinuation, verifyClaimToken } from './placement'

const live = { id: 'pl-1', huntId: 'h-1', revokedAt: null }
const base = { placement: live, canonicalHost: 'frequencylocal.com', requestHost: 'frequencylocal.com', path: '/h/abc', userAgent: 'Mozilla/5.0 (iPhone) Safari' }

describe('resolvePlacement', () => {
  it('lets a person on the canonical host reach the claim landing', () => {
    expect(resolvePlacement(base)).toEqual({ kind: 'landing', placementId: 'pl-1', huntId: 'h-1', canClaim: true })
  })

  it('gives a crawler the public landing with no claim path', () => {
    for (const userAgent of ['Googlebot/2.1', 'facebookexternalhit/1.1', 'Slackbot-LinkExpanding', '', null, undefined]) {
      expect(resolvePlacement({ ...base, userAgent })).toMatchObject({ kind: 'landing_public', canClaim: false })
    }
    expect(isCrawler('Mozilla/5.0 (iPhone) Safari')).toBe(false)
  })

  it('redirects the wrong host to the canonical host, keeping a safe path', () => {
    expect(resolvePlacement({ ...base, requestHost: 'evil.example' })).toEqual({ kind: 'redirect', to: 'https://frequencylocal.com/h/abc' })
    expect(resolvePlacement({ ...base, requestHost: 'evil.example', path: '//attacker.example' })).toEqual({ kind: 'redirect', to: 'https://frequencylocal.com/' })
  })

  it('refuses a revoked or missing placement', () => {
    expect(resolvePlacement({ ...base, placement: { ...live, revokedAt: '2026-11-10T00:00:00Z' } })).toEqual({ kind: 'refuse', reason: 'revoked' })
    expect(resolvePlacement({ ...base, placement: null })).toEqual({ kind: 'refuse', reason: 'not_found' })
  })

  it('never returns a claim: a GET only lands, redirects or refuses', () => {
    const kinds = [base, { ...base, userAgent: 'bot' }, { ...base, requestHost: 'x' }, { ...base, placement: null }].map((i) => resolvePlacement(i).kind)
    expect(kinds.every((k) => ['landing', 'landing_public', 'redirect', 'refuse'].includes(k))).toBe(true)
  })
})

describe('safeContinuation', () => {
  it('keeps same-site relative paths', () => {
    expect(safeContinuation('/hunts/x?a=1')).toBe('/hunts/x?a=1')
  })
  it('drops everything else', () => {
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', 'hunts/x', '', null, undefined, '/a\nb']) {
      expect(safeContinuation(bad)).toBeNull()
    }
  })
})

describe('claim token', () => {
  const secret = 's'
  const scope = { runId: 'run-1', placementId: 'pl-1' }
  const NOW = 1_800_000_000

  it('verifies for the same run and placement', () => {
    const token = issueClaimToken({ secret, scope, now: NOW })
    expect(verifyClaimToken({ secret, token, now: NOW + 5, expected: scope })).toBe(true)
  })

  it('rejects a token from another run or placement', () => {
    const token = issueClaimToken({ secret, scope, now: NOW })
    expect(verifyClaimToken({ secret, token, now: NOW + 5, expected: { ...scope, runId: 'run-2' } })).toBe(false)
    expect(verifyClaimToken({ secret, token, now: NOW + 5, expected: { ...scope, placementId: 'pl-2' } })).toBe(false)
  })

  it('rejects expired, forged and malformed tokens', () => {
    const token = issueClaimToken({ secret, scope, now: NOW, ttlSeconds: 60 })
    expect(verifyClaimToken({ secret, token, now: NOW + 60, expected: scope })).toBe(false)
    expect(verifyClaimToken({ secret: 'other', token, now: NOW + 5, expected: scope })).toBe(false)
    expect(verifyClaimToken({ secret, token: 'nope', now: NOW, expected: scope })).toBe(false)
    expect(verifyClaimToken({ secret, token: `${token}.x`, now: NOW, expected: scope })).toBe(false)
  })
})
