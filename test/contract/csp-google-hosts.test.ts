import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// LIVE-ADS-CSP-CONNECT-SRC: with GA4 linked to Google Ads the tag calls these three hosts. The
// browser drops the hit when connect-src omits them, and a dropped hit is a silently lost conversion.
const config = readFileSync(path.resolve(process.cwd(), 'next.config.ts'), 'utf8')
const line = config.split('\n').find((l) => l.trim().startsWith('"connect-src '))
const connect = (line ?? '').trim().slice(1).replace(/",?$/, '').split(/\s+/).slice(1)

describe('Google measurement hosts in connect-src', () => {
  it('allows the hosts GA4 and Ads call', () => {
    for (const host of [
      'https://www.google-analytics.com',
      'https://region1.google-analytics.com',
      'https://analytics.google.com',
      'https://stats.g.doubleclick.net',
      'https://www.google.com/g/collect',
    ]) expect(connect).toContain(host)
  })
  it('stays exact: no Google wildcard and no bare google.com', () => {
    expect(connect.filter((s) => /^https:\/\/\*\.(google|doubleclick)/.test(s))).toEqual([])
    expect(connect).not.toContain('https://www.google.com')
  })
})
