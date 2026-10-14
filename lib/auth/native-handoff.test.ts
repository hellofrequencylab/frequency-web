import { describe, it, expect } from 'vitest'
import { decideNativeReturn, NATIVE_APP_CALLBACK, NATIVE_HANDOFF_PATH } from './native-handoff'

const CODE = '3f2b8c1e-9a4d-4b7e-8f21-0c6d5e4a3b2c'
const decide = (query: string) => decideNativeReturn(new URLSearchParams(query))

describe('decideNativeReturn: the native sign-in return, opened in a browser', () => {
  it('a good code is handed to the app, never exchanged on the web', () => {
    const d = decide(`code=${CODE}`)
    expect(d.kind).toBe('handoff')
    if (d.kind !== 'handoff') return
    expect(d.appUrl).toBe(`${NATIVE_APP_CALLBACK}?code=${CODE}`)
    expect(d.handoffPath).toBe(`${NATIVE_HANDOFF_PATH}?code=${CODE}`)
    // The app-not-installed fallback: a FRESH web sign-in, which mints its own verifier.
    expect(d.webSignIn).toBe('/sign-in')
    expect(d.handoffPath).not.toContain('/auth/callback')
  })

  it('a safe next rides along to the app and to the web fallback', () => {
    const d = decide(`code=${CODE}&next=${encodeURIComponent('/events/craft-night')}`)
    if (d.kind !== 'handoff') throw new Error('expected handoff')
    expect(d.appUrl).toContain('next=%2Fevents%2Fcraft-night')
    expect(d.webSignIn).toBe('/sign-in?next=%2Fevents%2Fcraft-night')
  })

  it('an unsafe next is dropped everywhere (no open redirect)', () => {
    for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', '/\t/evil.com']) {
      const d = decide(`code=${CODE}&next=${encodeURIComponent(bad)}`)
      if (d.kind !== 'handoff') throw new Error('expected handoff')
      expect(d.next).toBe('')
      expect(d.appUrl).toBe(`${NATIVE_APP_CALLBACK}?code=${CODE}`)
      expect(d.webSignIn).toBe('/sign-in')
    }
  })

  it('a missing code goes back to sign-in with the callback error', () => {
    expect(decide('')).toEqual({ kind: 'failed', to: '/sign-in?error=callback' })
  })

  it('a malformed code is never echoed into a link', () => {
    for (const bad of ['short', 'abc def ghi jkl mno', `${CODE}&x=1`, 'javascript:alert(1)//aaaaaaaa', 'a'.repeat(200)]) {
      const d = decide(`code=${encodeURIComponent(bad)}`)
      expect(d).toEqual({ kind: 'failed', to: '/sign-in?error=callback' })
    }
  })

  it('an expired link reads as expired, and keeps a safe next', () => {
    const d = decide('error=access_denied&error_code=otp_expired&next=%2Ffeed')
    expect(d).toEqual({ kind: 'failed', to: '/sign-in?error=expired&next=%2Ffeed' })
  })

  it('a denied consent reads as denied, even with a code on the URL', () => {
    expect(decide(`error=access_denied&code=${CODE}`)).toEqual({ kind: 'failed', to: '/sign-in?error=denied' })
  })

  it('any other Supabase error is the generic callback line', () => {
    expect(decide('error=server_error')).toEqual({ kind: 'failed', to: '/sign-in?error=callback' })
  })
})
