import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { INDEXNOW_KEY, buildIndexNowPayload, recentSitemapUrls } from './indexnow'

const SITE = 'https://frequencylocal.com'
const now = Date.parse('2026-10-22T12:00:00Z')

describe('IndexNow key file', () => {
  it('serves the key from the site root, named for the key', () => {
    expect(readFileSync(`public/${INDEXNOW_KEY}.txt`, 'utf8').trim()).toBe(INDEXNOW_KEY)
  })
})

describe('recentSitemapUrls', () => {
  it('keeps only own-host urls changed inside the window, once each', () => {
    const since = now - 26 * 3600_000
    const urls = recentSitemapUrls(
      [
        { url: `${SITE}/events/new-moon`, lastModified: new Date(now - 3600_000) },
        { url: `${SITE}/events/new-moon`, lastModified: new Date(now - 1000) },
        { url: `${SITE}/old`, lastModified: new Date(now - 30 * 3600_000) },
        { url: `${SITE}/undated` },
        { url: 'https://example.org/elsewhere', lastModified: new Date(now) },
        { url: 'not a url', lastModified: new Date(now) },
      ],
      since,
      SITE,
    )
    expect(urls).toEqual([`${SITE}/events/new-moon`])
  })
})

describe('buildIndexNowPayload', () => {
  it('names the host and the key file location', () => {
    const p = buildIndexNowPayload([`${SITE}/a`], `${SITE}/`)
    expect(p).toEqual({
      host: 'frequencylocal.com',
      key: INDEXNOW_KEY,
      keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`,
      urlList: [`${SITE}/a`],
    })
  })
})
