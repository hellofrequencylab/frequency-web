import { describe, it, expect } from 'vitest'
import { evaluateContactConsent } from './contact-consent'

describe('evaluateContactConsent — transactional (one-time invite)', () => {
  it('allows an unknown contact (the card-scan nudge is a notification + invite, not a stream)', () => {
    expect(evaluateContactConsent({ purpose: 'transactional', suppressed: false, consentState: 'unknown' })).toEqual({
      allowed: true,
      reason: 'ok',
    })
  })

  it('allows a subscribed contact', () => {
    expect(evaluateContactConsent({ purpose: 'transactional', suppressed: false, consentState: 'subscribed' }).allowed).toBe(true)
  })

  it('blocks an unsubscribed contact', () => {
    expect(evaluateContactConsent({ purpose: 'transactional', suppressed: false, consentState: 'unsubscribed' })).toEqual({
      allowed: false,
      reason: 'unsubscribed',
    })
  })
})

describe('evaluateContactConsent — marketing (ongoing stream)', () => {
  it('requires an explicit opt-in: unknown is blocked', () => {
    expect(evaluateContactConsent({ purpose: 'marketing', suppressed: false, consentState: 'unknown' })).toEqual({
      allowed: false,
      reason: 'not_opted_in',
    })
  })

  it('allows a subscribed contact', () => {
    expect(evaluateContactConsent({ purpose: 'marketing', suppressed: false, consentState: 'subscribed' })).toEqual({
      allowed: true,
      reason: 'ok',
    })
  })

  it('blocks an unsubscribed contact', () => {
    expect(evaluateContactConsent({ purpose: 'marketing', suppressed: false, consentState: 'unsubscribed' }).reason).toBe('unsubscribed')
  })
})

describe('evaluateContactConsent — suppression precedence (overrides everything)', () => {
  it('a suppressed address is blocked even when subscribed', () => {
    expect(evaluateContactConsent({ purpose: 'marketing', suppressed: true, consentState: 'subscribed' })).toEqual({
      allowed: false,
      reason: 'suppressed',
    })
  })

  it('suppression outranks unsubscribed (suppression is the most fundamental block)', () => {
    expect(evaluateContactConsent({ purpose: 'transactional', suppressed: true, consentState: 'unsubscribed' }).reason).toBe('suppressed')
  })
})
