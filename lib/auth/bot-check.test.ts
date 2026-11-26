import { afterEach, describe, expect, it, vi } from 'vitest'
import { BOT_CHECK_FIELD, botCheckMissing, botCheckSiteKey, botCheckToken } from './bot-check'

// SEC-047: the invisible bot check is off until the site key is set, and then a form without a token
// is answered before Supabase is asked.

afterEach(() => vi.unstubAllEnvs())

const form = (token?: string) => {
  const fd = new FormData()
  fd.set('email', 'a@example.com')
  if (token !== undefined) fd.set(BOT_CHECK_FIELD, token)
  return fd
}

describe('bot check', () => {
  it('is off with no site key: no token needed, none sent', () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '')
    expect(botCheckSiteKey()).toBe('')
    expect(botCheckMissing(botCheckToken(form()))).toBe(false)
  })
  it('once on, refuses a form with no token or a blank one', () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '0x4AAAAAAAtest')
    expect(botCheckMissing(botCheckToken(form()))).toBe(true)
    expect(botCheckMissing(botCheckToken(form('   ')))).toBe(true)
  })
  it('passes a token through, trimmed', () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '0x4AAAAAAAtest')
    expect(botCheckToken(form(' tok-1 '))).toBe('tok-1')
    expect(botCheckMissing('tok-1')).toBe(false)
  })
})
