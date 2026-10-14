import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { GET } from './route'

const CODE = '3f2b8c1e-9a4d-4b7e-8f21-0c6d5e4a3b2c'
const hit = (query: string) => GET(new Request(`https://frequencylocal.com/auth/native${query}`))

describe('GET /auth/native', () => {
  it('a good code goes to the hand-off page on the same origin, not to /auth/callback', () => {
    const res = hit(`?code=${CODE}&next=%2Ffeed`)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe(
      `https://frequencylocal.com/auth/native/open?code=${CODE}&next=%2Ffeed`,
    )
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('a missing code goes back to sign-in', () => {
    expect(hit('').headers.get('location')).toBe('https://frequencylocal.com/sign-in?error=callback')
  })

  it('an expired link goes back to sign-in as expired', () => {
    expect(hit('?error=access_denied&error_code=otp_expired').headers.get('location')).toBe(
      'https://frequencylocal.com/sign-in?error=expired',
    )
  })

  it('a denied consent goes back to sign-in as denied', () => {
    expect(hit('?error=access_denied').headers.get('location')).toBe('https://frequencylocal.com/sign-in?error=denied')
  })

  it('an off-site next never leaves the origin', () => {
    const loc = hit(`?code=${CODE}&next=${encodeURIComponent('//evil.com')}`).headers.get('location')!
    expect(new URL(loc).origin).toBe('https://frequencylocal.com')
    expect(loc).not.toContain('evil')
  })

  it('exchanges nothing and touches no session or cookie', () => {
    const src = readFileSync('app/auth/native/route.ts', 'utf8')
    expect(src).not.toMatch(/exchangeCodeForSession|createClient|cookies\(/)
    const res = hit(`?code=${CODE}`)
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})
