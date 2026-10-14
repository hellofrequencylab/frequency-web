import { describe, it, expect } from 'vitest'
import { safeNextPath } from './safe-next'
import { isSafeInAppPath } from '@/lib/funnels/destination'
import { callbackErrorCode, signInErrorMessage, SIGN_IN_ERRORS } from '@/app/sign-in/errors'

// The post-sign-in destination rule, shared by /sign-in, its two actions and /auth/callback.
describe('safeNextPath', () => {
  it.each(['/feed', '/events/abc?tab=rsvp', '/circles/x#chat', '/join?seq=breath%20work'])('keeps %s', (p) => {
    expect(safeNextPath(p)).toBe(p)
  })

  it.each([
    ['protocol-relative', '//evil.com'],
    ['backslash jump', '/\\evil.com'],
    ['backslash later', '/a\\b'],
    ['tab the browser strips', '/\t/evil.com'],
    ['newline', '/\n/evil.com'],
    ['raw space', '/a b'],
    ['DEL', '/\u007f/evil.com'],
    ['absolute URL', 'https://evil.com'],
    ['scheme', 'javascript:alert(1)'],
    ['relative', 'feed'],
    ['empty', ''],
  ])('refuses %s', (_label, p) => {
    expect(safeNextPath(p)).toBe('')
  })

  it('refuses a non-string and an absurdly long value', () => {
    expect(safeNextPath(undefined)).toBe('')
    expect(safeNextPath(null)).toBe('')
    expect(safeNextPath(42)).toBe('')
    expect(safeNextPath('/' + 'a'.repeat(3000))).toBe('')
  })

  it('agrees with the funnel destination rule on the control-character shape', () => {
    expect(isSafeInAppPath('/\t/evil.com')).toBe(false)
    expect(isSafeInAppPath('/a\\b')).toBe(false)
    expect(isSafeInAppPath('/feed?x=1')).toBe(true)
  })
})

describe('an /auth/callback failure names what went wrong', () => {
  it('an expired or reused email link reads as expired', () => {
    expect(callbackErrorCode({ error: 'access_denied', error_code: 'otp_expired' })).toBe('expired')
  })
  it('a cancelled Google consent reads as cancelled, not as a dead link', () => {
    expect(callbackErrorCode({ error: 'access_denied', error_code: null })).toBe('denied')
  })
  it('anything else (no code, a failed exchange) keeps the general line', () => {
    expect(callbackErrorCode({})).toBe('callback')
    expect(callbackErrorCode({ error: 'server_error' })).toBe('callback')
  })
  it('every code it can return has its own sentence on the form', () => {
    for (const code of ['expired', 'denied', 'callback'] as const) {
      expect(signInErrorMessage(code)).toBe(SIGN_IN_ERRORS[code])
    }
  })
})
