import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  SITE_ADMIN_PASS_MAX_AGE_S,
  passOpensSite,
  readSiteAdminPass,
  siteAdminHandoffPath,
  siteAdminView,
  signSiteAdminPass,
} from './site-admin-pass'

const SPACE = '11111111-2222-4333-8444-555555555555'
const PERSON = '66666666-7777-4888-9999-000000000000'
const pass = { spaceId: SPACE, host: 'TheHeartOnFire.com', profileId: PERSON, staff: false }

describe('the website admin pass', () => {
  const prev = process.env.SITE_ADMIN_PASS_SECRET
  beforeEach(() => {
    process.env.SITE_ADMIN_PASS_SECRET = 'test-secret'
  })
  afterEach(() => {
    process.env.SITE_ADMIN_PASS_SECRET = prev
  })

  it('round-trips and opens only the site and Space it was minted for', () => {
    const now = Date.UTC(2026, 9, 7, 23)
    const token = signSiteAdminPass(pass, now)!
    const read = readSiteAdminPass(token, now + 1000)
    expect(read).toEqual({ spaceId: SPACE, host: 'theheartonfire.com', profileId: PERSON, staff: false })
    expect(passOpensSite(read, 'theheartonfire.com', SPACE)).toBe(true)
    expect(passOpensSite(read, 'danieltyack.com', SPACE)).toBe(false)
    expect(passOpensSite(read, 'theheartonfire.com', PERSON)).toBe(false)
  })

  it('refuses a tampered, foreign, stale or future pass', () => {
    const now = Date.UTC(2026, 9, 7, 23)
    const token = signSiteAdminPass(pass, now)!
    expect(readSiteAdminPass(`${token}x`, now)).toBeNull()
    expect(readSiteAdminPass(`x${token}`, now)).toBeNull()
    expect(readSiteAdminPass(token, now + SITE_ADMIN_PASS_MAX_AGE_S * 1000 + 1)).toBeNull()
    expect(readSiteAdminPass(token, now - 10 * 60 * 1000)).toBeNull()
    expect(readSiteAdminPass('', now)).toBeNull()
    process.env.SITE_ADMIN_PASS_SECRET = 'other-secret'
    expect(readSiteAdminPass(token, now)).toBeNull()
  })

  it('mints nothing from bad input', () => {
    expect(signSiteAdminPass({ ...pass, spaceId: 'nope' })).toBeNull()
    expect(signSiteAdminPass({ ...pass, host: 'bad host/' })).toBeNull()
  })

  it('names the views and the console handoff', () => {
    expect(siteAdminView('calendar')).toBe('calendar')
    expect(siteAdminView('enter')).toBeNull()
    expect(siteAdminHandoffPath('heart-on-fire', 'overview')).toBe('/spaces/heart-on-fire/manage/leadership/open?to=overview')
  })
})
