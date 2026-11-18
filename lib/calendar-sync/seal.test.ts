import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import { openCalendarSecret, sealCalendarSecret, type CalendarSealBinding } from './seal'

// Calendar tokens are sealed at rest (LIVE-1179, ADR-1976): no key, no write; a ciphertext opens
// only for the exact Space, provider, connection and purpose it was sealed for.

const binding: CalendarSealBinding = { spaceId: 'space-1', provider: 'google', connectionId: 'conn-1' }
const tokens = { accessToken: 'access-fixture', refreshToken: 'refresh-fixture', expiresAt: '2026-12-01T00:00:00.000Z' }

afterEach(() => vi.unstubAllEnvs())

describe('sealCalendarSecret', () => {
  it('round-trips and never stores the plaintext', () => {
    vi.stubEnv('CALENDAR_SYNC_ENCRYPTION_KEY', randomBytes(32).toString('base64'))
    const sealed = sealCalendarSecret(binding, 'tokens', tokens)
    expect(sealed).toMatch(/^v1\./)
    expect(sealed).not.toContain('access-fixture')
    expect(sealed).not.toContain('refresh-fixture')
    expect(openCalendarSecret(binding, 'tokens', sealed)).toEqual(tokens)
  })

  it('refuses to seal without a well-formed 32-byte key', () => {
    vi.stubEnv('CALENDAR_SYNC_ENCRYPTION_KEY', '')
    expect(sealCalendarSecret(binding, 'tokens', tokens)).toBeNull()
    vi.stubEnv('CALENDAR_SYNC_ENCRYPTION_KEY', 'short')
    expect(sealCalendarSecret(binding, 'tokens', tokens)).toBeNull()
    vi.stubEnv('CALENDAR_SYNC_ENCRYPTION_KEY', randomBytes(16).toString('base64'))
    expect(sealCalendarSecret(binding, 'tokens', tokens)).toBeNull()
  })

  it('does not open for another Space, connection, provider or purpose, or under another key', () => {
    vi.stubEnv('CALENDAR_SYNC_ENCRYPTION_KEY', randomBytes(32).toString('base64'))
    const sealed = sealCalendarSecret(binding, 'tokens', tokens)
    expect(openCalendarSecret({ ...binding, spaceId: 'space-2' }, 'tokens', sealed)).toBeNull()
    expect(openCalendarSecret({ ...binding, connectionId: 'conn-2' }, 'tokens', sealed)).toBeNull()
    expect(openCalendarSecret({ ...binding, provider: 'outlook' }, 'tokens', sealed)).toBeNull()
    expect(openCalendarSecret(binding, 'pending', sealed)).toBeNull()
    vi.stubEnv('CALENDAR_SYNC_ENCRYPTION_KEY', randomBytes(32).toString('base64'))
    expect(openCalendarSecret(binding, 'tokens', sealed)).toBeNull()
  })

  it('rejects a tampered or malformed ciphertext', () => {
    vi.stubEnv('CALENDAR_SYNC_ENCRYPTION_KEY', randomBytes(32).toString('base64'))
    const sealed = sealCalendarSecret(binding, 'tokens', tokens) ?? ''
    const parts = sealed.split('.')
    const flipped = parts[3].startsWith('A') ? `B${parts[3].slice(1)}` : `A${parts[3].slice(1)}`
    expect(openCalendarSecret(binding, 'tokens', [parts[0], parts[1], parts[2], flipped].join('.'))).toBeNull()
    expect(openCalendarSecret(binding, 'tokens', 'v1.not.valid')).toBeNull()
    expect(openCalendarSecret(binding, 'tokens', null)).toBeNull()
  })
})
