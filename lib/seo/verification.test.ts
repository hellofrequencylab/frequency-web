import { afterEach, describe, expect, it } from 'vitest'
import { siteVerification } from './verification'

const KEYS = ['GOOGLE_SITE_VERIFICATION', 'BING_SITE_VERIFICATION'] as const
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('siteVerification', () => {
  it('is undefined when both are unset or blank', () => {
    delete process.env.GOOGLE_SITE_VERIFICATION
    process.env.BING_SITE_VERIFICATION = '   '
    expect(siteVerification()).toBeUndefined()
  })

  it('emits the Google tag alone', () => {
    process.env.GOOGLE_SITE_VERIFICATION = ' abc123 '
    delete process.env.BING_SITE_VERIFICATION
    expect(siteVerification()).toEqual({ google: 'abc123' })
  })

  it('emits Bing as msvalidate.01 and both together', () => {
    process.env.GOOGLE_SITE_VERIFICATION = 'g'
    process.env.BING_SITE_VERIFICATION = 'b'
    expect(siteVerification()).toEqual({ google: 'g', other: { 'msvalidate.01': 'b' } })
  })
})
