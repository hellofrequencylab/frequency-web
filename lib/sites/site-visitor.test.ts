import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { routeSiteHost } from '@/lib/sites/host'
import {
  SITE_VISITOR_MAX_AGE_S,
  readVisitorCookie,
  readVisitorExit,
  readVisitorHandoff,
  safeSitePath,
  signVisitorCookie,
  signVisitorExit,
  signVisitorHandoff,
} from '@/lib/sites/site-visitor'

const PERSON = { profileId: '11111111-2222-4333-8444-555555555555', name: 'Dana Lee', handle: 'dana', avatarUrl: 'https://cdn.example.com/d.jpg' }
const HOST = 'thegrouplocal.com'
const NOW = 1_800_000_000_000
const saved = process.env.SITE_ADMIN_PASS_SECRET

beforeEach(() => { process.env.SITE_ADMIN_PASS_SECRET = 'test-secret-for-visitor-pass' })
afterEach(() => { process.env.SITE_ADMIN_PASS_SECRET = saved })

describe('the visitor handoff token', () => {
  it('carries the person to the host it was minted for', () => {
    const token = signVisitorHandoff(HOST, PERSON, NOW)!
    expect(readVisitorHandoff(token, HOST, NOW + 1000)).toEqual(PERSON)
  })
  it('never opens another site', () => {
    const token = signVisitorHandoff(HOST, PERSON, NOW)!
    expect(readVisitorHandoff(token, 'other-site.com', NOW)).toBeNull()
  })
  it('expires after 60 seconds and is not valid from the future', () => {
    const token = signVisitorHandoff(HOST, PERSON, NOW)!
    expect(readVisitorHandoff(token, HOST, NOW + 61_000)).toBeNull()
    expect(readVisitorHandoff(token, HOST, NOW - 5 * 60_000)).toBeNull()
  })
  it('rejects a tampered token and a missing secret', () => {
    const token = signVisitorHandoff(HOST, PERSON, NOW)!
    const [body, sig] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ h: HOST, iat: NOW, n: 'x', v: { p: PERSON.profileId, nm: 'Admin', hd: null, av: null } })).toString('base64url')
    expect(readVisitorHandoff(`${forged}.${sig}`, HOST, NOW)).toBeNull()
    expect(readVisitorHandoff(`${body}.AAAA`, HOST, NOW)).toBeNull()
    process.env.SITE_ADMIN_PASS_SECRET = ''
    delete process.env.OAUTH_STATE_SECRET
    expect(signVisitorHandoff(HOST, PERSON, NOW)).toBeNull()
  })
})

describe('purposes never cross', () => {
  it('a handoff is not a cookie, a cookie is not a handoff, neither is an exit', () => {
    const handoff = signVisitorHandoff(HOST, PERSON, NOW)!
    const cookie = signVisitorCookie(HOST, PERSON, NOW)!
    const exit = signVisitorExit(HOST, NOW)!
    expect(readVisitorCookie(handoff, HOST, NOW)).toBeNull()
    expect(readVisitorHandoff(cookie, HOST, NOW)).toBeNull()
    expect(readVisitorExit(cookie, HOST, NOW)).toBe(false)
    expect(readVisitorExit(handoff, HOST, NOW)).toBe(false)
    expect(readVisitorHandoff(exit, HOST, NOW)).toBeNull()
  })
})

describe('the display cookie', () => {
  it('names the visitor on its own host for 30 days only', () => {
    const cookie = signVisitorCookie(HOST, PERSON, NOW)!
    expect(readVisitorCookie(cookie, HOST, NOW + 1000)?.name).toBe('Dana Lee')
    expect(readVisitorCookie(cookie, 'other-site.com', NOW)).toBeNull()
    expect(readVisitorCookie(cookie, HOST, NOW + (SITE_VISITOR_MAX_AGE_S + 1) * 1000)).toBeNull()
  })
  it('drops an avatar that is not https and a handle with odd characters', () => {
    const cookie = signVisitorCookie(HOST, { ...PERSON, avatarUrl: 'javascript:alert(1)', handle: '<b>' }, NOW)!
    const read = readVisitorCookie(cookie, HOST, NOW)!
    expect(read.avatarUrl).toBeNull()
    expect(read.handle).toBeNull()
  })
})

describe('the exit token', () => {
  it('is valid for its own host for a minute', () => {
    const exit = signVisitorExit(HOST, NOW)!
    expect(readVisitorExit(exit, HOST, NOW + 30_000)).toBe(true)
    expect(readVisitorExit(exit, 'other-site.com', NOW)).toBe(false)
    expect(readVisitorExit(exit, HOST, NOW + 61_000)).toBe(false)
  })
})

describe('where a handoff may land', () => {
  it('is Home or one single-segment page, never anything else', () => {
    expect(safeSitePath('/')).toBe('/')
    expect(safeSitePath('/contact')).toBe('/contact')
    for (const bad of ['//evil.com', 'https://evil.com', '/a/b', '/\\evil.com', '/%09/evil.com', '/_s/exit', '', null, undefined]) {
      expect(safeSitePath(bad as string | null | undefined)).toBe('/')
    }
  })
})

describe('routing the visitor paths on a website host', () => {
  it('rewrites the three paths to the site route and 404s anything else under /_s', () => {
    expect(routeSiteHost(HOST, '/_s/enter', '?t=x')).toEqual({ kind: 'rewrite', pathname: `/hosted/${HOST}/visitor/enter` })
    expect(routeSiteHost(HOST, '/_s/me', '')).toEqual({ kind: 'rewrite', pathname: `/hosted/${HOST}/visitor/me` })
    expect(routeSiteHost(HOST, '/_s/exit', '')).toEqual({ kind: 'rewrite', pathname: `/hosted/${HOST}/visitor/exit` })
    expect(routeSiteHost(HOST, '/_s/other', '')).toEqual({ kind: 'not-found' })
  })
  it('leaves Frequency itself alone', () => {
    expect(routeSiteHost('frequencylocal.com', '/_s/me', '')).toEqual({ kind: 'none' })
  })
})
