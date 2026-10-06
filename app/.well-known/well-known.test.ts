import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { GET as aasa } from './apple-app-site-association/route'
import { GET as assetlinks } from './assetlinks.json/route'

// LIVE-714: the app association files, served from the environment.

afterEach(() => vi.unstubAllEnvs())

describe('apple-app-site-association', () => {
  it('claims nothing while APPLE_TEAM_ID is unset', async () => {
    vi.stubEnv('APPLE_TEAM_ID', '')
    const res = aasa()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')
    const body = await res.json()
    expect(body.applinks.details).toEqual([])
    expect(body.webcredentials.apps).toEqual([])
  })

  it('refuses a team id that is not Apple-shaped', async () => {
    vi.stubEnv('APPLE_TEAM_ID', 'TEAM_ID')
    expect((await aasa().json()).applinks.details).toEqual([])
  })

  it('claims the member routes under the real team id', async () => {
    vi.stubEnv('APPLE_TEAM_ID', 'AB12CD34EF')
    const body = await aasa().json()
    expect(body.applinks.details[0].appID).toBe('AB12CD34EF.com.frequency.app')
    expect(body.applinks.details[0].paths).toEqual(
      expect.arrayContaining(['/n/*', '/q/*', '/spaces/*', '/practices/*', '/messages/*']),
    )
    expect(body.applinks.details[0].paths.some((p: string) => p.startsWith('/b'))).toBe(false)
    expect(body.webcredentials.apps).toEqual(['AB12CD34EF.com.frequency.app'])
  })
})

describe('assetlinks.json', () => {
  const fp = Array.from({ length: 32 }, () => 'AB').join(':')

  it('is an empty list with no fingerprint', async () => {
    vi.stubEnv('ANDROID_SHA256_FINGERPRINTS', '')
    expect(await assetlinks().json()).toEqual([])
  })

  it('lists the valid fingerprints and drops junk', async () => {
    vi.stubEnv('ANDROID_SHA256_FINGERPRINTS', `${fp.toLowerCase()}, nope`)
    const body = await assetlinks().json()
    expect(body[0].target.sha256_cert_fingerprints).toEqual([fp])
    expect(body[0].target.package_name).toBe('com.frequency.app')
  })
})

describe('the proxy', () => {
  it('does not run on /.well-known', () => {
    const src = readFileSync('proxy.ts', 'utf8')
    expect(src).toMatch(/\\\\\.well-known\//)
  })
})
