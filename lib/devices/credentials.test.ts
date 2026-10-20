import { describe, expect, it, beforeAll } from 'vitest'
import {
  hashUid,
  newCardToken,
  newDeviceSecret,
  normalizeCardToken,
  normalizeHandle,
  normalizeUid,
  parseDeviceHeader,
  secretMatches,
  sha256Hex,
} from './credentials'

// LIVE-1113: the device header, the stored hashes and the input normalizers a scanner leans on.

const ID = '4b3f1c2e-8d7a-4c1b-9e2f-1a2b3c4d5e6f'

beforeAll(() => {
  process.env.UNSUBSCRIBE_SECRET = 'test-signing-key-for-card-uids-000'
})

describe('device header', () => {
  it('splits <uuid>.<secret>', () => {
    const secret = newDeviceSecret()
    expect(parseDeviceHeader(`${ID}.${secret}`)).toEqual({ id: ID, secret })
    expect(parseDeviceHeader(`  ${ID.toUpperCase()}.${secret} `)).toEqual({ id: ID, secret })
  })

  it('refuses every other shape', () => {
    const secret = newDeviceSecret()
    for (const bad of [null, '', 'nope', `${ID}`, `${ID}.`, `not-a-uuid.${secret}`, `${ID}.short`, `${ID}.${secret}!`, `Bearer ${ID}.${secret}`]) {
      expect(parseDeviceHeader(bad)).toBeNull()
    }
  })

  it('matches only the secret whose sha256 was stored', () => {
    const secret = newDeviceSecret()
    const stored = sha256Hex(secret)
    expect(stored).toMatch(/^[0-9a-f]{64}$/)
    expect(secretMatches(secret, stored)).toBe(true)
    expect(secretMatches(newDeviceSecret(), stored)).toBe(false)
    expect(secretMatches(secret, null)).toBe(false)
    expect(secretMatches(secret, 'abc')).toBe(false)
  })
})

describe('card token', () => {
  it('is 16 random bytes in base64url, and fresh each time', () => {
    const a = newCardToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(Buffer.from(a, 'base64url')).toHaveLength(16)
    expect(newCardToken()).not.toBe(a)
    expect(normalizeCardToken(a)).toBe(a)
  })

  it('refuses a token that cannot be one', () => {
    for (const bad of [undefined, 42, '', 'short', 'has space in it xxxxxx', 'a'.repeat(129), '../../etc/passwd/xxxxxxx']) {
      expect(normalizeCardToken(bad)).toBeNull()
    }
  })
})

describe('chip UID', () => {
  it('normalizes separators and case', () => {
    expect(normalizeUid('04:a2:1f:9c')).toBe('04A21F9C')
    expect(normalizeUid('04 A2 1F 9C 11 22 33')).toBe('04A21F9C112233')
    expect(normalizeUid('04a2')).toBeNull()
    expect(normalizeUid('04A21F9')).toBeNull()
    expect(normalizeUid('zz:zz:zz:zz')).toBeNull()
    expect(normalizeUid(null)).toBeNull()
  })

  it('is stored as a keyed hash, never the UID itself', () => {
    const h = hashUid('04A21F9C')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).toBe(hashUid('04A21F9C'))
    expect(h).not.toBe(sha256Hex('04A21F9C'))
    expect(h).not.toBe(hashUid('04A21F9D'))
  })
})

describe('member handle', () => {
  it('drops the @ and lowercases', () => {
    expect(normalizeHandle('@Maya')).toBe('maya')
    expect(normalizeHandle(' dan_t ')).toBe('dan_t')
    expect(normalizeHandle('')).toBeNull()
    expect(normalizeHandle('has space')).toBeNull()
    expect(normalizeHandle(7)).toBeNull()
  })
})
