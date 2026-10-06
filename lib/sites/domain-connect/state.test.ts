import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { domainConnectReturnPath, readDomainConnectState, signDomainConnectState } from './state'

const SECRETS = [
  'DOMAIN_CONNECT_STATE_SECRET',
  'OAUTH_STATE_SECRET',
  'UNSUBSCRIBE_SECRET',
  'CRON_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of SECRETS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
  process.env.DOMAIN_CONNECT_STATE_SECRET = 'unit-test-domain-connect-secret'
})

afterEach(() => {
  for (const k of SECRETS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('domain connect state', () => {
  it('round-trips the slug it was minted for', () => {
    const s = signDomainConnectState('ember-yoga')!
    expect(readDomainConnectState(s)).toBe('ember-yoga')
  })

  it('rejects a tampered body (a different slug under the old signature)', () => {
    const s = signDomainConnectState('ember-yoga')!
    const sig = s.split('.')[1]
    const forged = Buffer.from(JSON.stringify({ s: 'evil', iat: Date.now(), n: 'x' })).toString('base64url')
    expect(readDomainConnectState(`${forged}.${sig}`)).toBeNull()
  })

  it('rejects a tampered signature', () => {
    const s = signDomainConnectState('ember-yoga')!
    expect(readDomainConnectState(s.slice(0, -1) + (s.endsWith('A') ? 'B' : 'A'))).toBeNull()
  })

  it('rejects a stale state and one from the future', () => {
    const t = Date.now()
    const s = signDomainConnectState('ember-yoga', t)!
    expect(readDomainConnectState(s, t + 61 * 60 * 1000)).toBeNull()
    expect(readDomainConnectState(signDomainConnectState('ember-yoga', t + 10 * 60 * 1000)!, t)).toBeNull()
  })

  it('rejects junk and missing values without throwing', () => {
    for (const v of [null, undefined, '', '.', 'abc', 'abc.', '.abc', 'a.b.c', 'x'.repeat(5000)]) {
      expect(readDomainConnectState(v)).toBeNull()
    }
  })

  it('will not sign something that is not a slug, so no URL or path ever rides in the state', () => {
    expect(signDomainConnectState('https://evil.example')).toBeNull()
    expect(signDomainConnectState('../admin')).toBeNull()
  })

  it('is not minted and never verifies when no secret is set', () => {
    const s = signDomainConnectState('ember-yoga')!
    for (const k of SECRETS) delete process.env[k]
    expect(signDomainConnectState('ember-yoga')).toBeNull()
    expect(readDomainConnectState(s)).toBeNull()
  })

  it('does not verify under a different secret', () => {
    const s = signDomainConnectState('ember-yoga')!
    process.env.DOMAIN_CONNECT_STATE_SECRET = 'another-secret'
    expect(readDomainConnectState(s)).toBeNull()
  })
})

describe('domainConnectReturnPath', () => {
  it('lands on the Space Profile & Settings, as a same-origin path', () => {
    expect(domainConnectReturnPath('ember-yoga')).toBe('/spaces/ember-yoga/manage?section=settings')
  })
})
