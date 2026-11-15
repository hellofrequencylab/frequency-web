import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  capture: true, captureThrows: false, firstTouch: false, allowed: true, claimed: true, suppressed: false,
  queueFailure: false, rows: new Map<string, Record<string, unknown>>(), captureCalls: 0, claims: [] as string[],
}))
vi.mock('next/headers', () => ({ headers: async () => new Map([['x-forwarded-for', '192.0.2.1']]) }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: async () => state.allowed, claimOnce: async (key: string) => { state.claims.push(key); return state.claimed } }))
vi.mock('@/lib/log', () => ({ log: { error: vi.fn() } }))
vi.mock('@/lib/crm/lead-capture', async original => ({
  ...(await original<typeof import('@/lib/crm/lead-capture')>()),
  captureLeadMagnet: async () => {
    state.captureCalls++
    if (state.captureThrows) throw Error('capture unavailable')
    return state.capture ? { contactId: 'contact', firstTouch: state.firstTouch } : null
  },
}))
// Exercise the REAL enqueueEmail and REAL outbox enqueue. Only its database boundary is simulated,
// including Postgres's existing unique-violation behavior when Redis is unavailable/fail-open.
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (table: string) => {
  if (table === 'email_suppressions') return { select: () => ({ eq: async () => ({ data: state.suppressed ? [{ space_id: null }] : [], error: null }) }) }
  if (table === 'notification_queue') return { insert: async (row: Record<string, unknown>) => {
    if (state.queueFailure) return { error: { code: '08006', message: 'queue unavailable' } }
    const key = row.dedupe_key as string
    if (state.rows.has(key)) return { error: { code: '23505', message: 'duplicate' } }
    state.rows.set(key, row)
    return { error: null }
  } }
  throw Error('Unexpected table: ' + table)
} }) }))
import { makeLeadLinkPayload, signLeadLink } from '@/lib/crm/lead-links'
import { captureUnlock } from './actions'
import { sendLeadMagnetResource } from '@/lib/crm/lead-magnet-resource-io'

const blank = { name: 'Maya', email: ' MAYA@Example.com ', phone: '', company: '' }
const token = (resource = 'https://example.com/guide.pdf') => signLeadLink(makeLeadLinkPayload({ s: 'space', d: 'lead_magnet', l: 'First gathering checklist', ...(resource ? { r: resource } : {}) }))
const request = { spaceId: 'space', email: 'maya@example.com', resourceUrl: 'https://example.com/guide.pdf', label: 'Guide', now: new Date('2026-11-14T12:30:00Z') }
beforeEach(() => {
  vi.stubEnv('OPTIN_CONFIRM_SECRET', 'test-only-resource-signing-secret')
  state.capture = true; state.captureThrows = false; state.firstTouch = false; state.allowed = true
  state.claimed = true; state.suppressed = false; state.queueFailure = false
  state.rows.clear(); state.captureCalls = 0; state.claims = []
})

afterEach(() => vi.unstubAllEnvs())

describe('requested resource delivery through the real outbox boundary', () => {
  it('an existing contact gets the signed resource copy and immediate reveal', async () => {
    const result = await captureUnlock({ ...blank, token: token() })
    expect(result).toMatchObject({ ok: true, link: { href: request.resourceUrl } })
    expect(state.captureCalls).toBe(1)
    expect(state.rows.size).toBe(1)
    const row = [...state.rows.values()][0]
    expect(row.kind).toBe('email')
    expect(row.payload).toMatchObject({ to: 'maya@example.com', subject: 'Your requested resource' })
    expect((row.payload as { text: string }).text).toContain(request.resourceUrl)
    expect(row.dedupe_key).not.toContain('maya@example.com')
    expect(row.payload).not.toHaveProperty('from')
  })
  it('keeps a single durable job for repeated and different resources within an hour when Redis permits everything', async () => {
    await sendLeadMagnetResource(request)
    await sendLeadMagnetResource(request)
    await sendLeadMagnetResource({ ...request, resourceUrl: 'https://example.com/another.pdf' })
    expect(state.rows.size).toBe(1)
    await sendLeadMagnetResource({ ...request, now: new Date('2026-11-14T13:30:00Z') })
    expect(state.rows.size).toBe(2)
  })
  it('keeps different Spaces and different recipients independent', async () => {
    await sendLeadMagnetResource(request)
    await sendLeadMagnetResource({ ...request, spaceId: 'another-space' })
    await sendLeadMagnetResource({ ...request, email: 'another@example.com' })
    expect(state.rows.size).toBe(3)
  })
  for (const kind of ['capture null', 'capture throws', 'suppressed', 'Redis claimed', 'honeypot'] as const) it(`${kind} never queues a copy and keeps inline access`, async () => {
    if (kind === 'capture null') state.capture = false
    if (kind === 'capture throws') state.captureThrows = true
    if (kind === 'suppressed') state.suppressed = true
    if (kind === 'Redis claimed') state.claimed = false
    const result = await captureUnlock({ ...blank, company: kind === 'honeypot' ? 'bot' : '', token: token() })
    expect(result).toMatchObject({ ok: true, link: { href: request.resourceUrl } })
    expect(state.rows.size).toBe(0)
    if (kind === 'honeypot') expect(state.captureCalls).toBe(0)
  })
  it('queue failure preserves reveal and never claims that mail is on its way', async () => {
    state.queueFailure = true
    const result = await captureUnlock({ ...blank, token: token() })
    expect(result).toMatchObject({ ok: true, link: { href: request.resourceUrl } })
    expect(JSON.stringify(result)).not.toMatch(/inbox|on its way|sent/i)
  })
  it('legacy links without a resource make no false inbox promise or invented delivery', async () => {
    const result = await captureUnlock({ ...blank, token: token('') })
    expect(result).toMatchObject({ ok: true, message: 'Ask the person who shared this link for the resource.' })
    expect(state.rows.size).toBe(0)
    expect(state.claims).toHaveLength(0)
  })
  it('rejects wrong-door, forged, expired, invalid-address and IP-limited requests before any capture or mail', async () => {
    const wrongDoor = signLeadLink(makeLeadLinkPayload({ s: 'space', d: 'event' }))
    const expired = signLeadLink({ s: 'space', d: 'lead_magnet', exp: 1, r: request.resourceUrl })
    for (const invalid of [wrongDoor, expired, 'forged']) expect((await captureUnlock({ ...blank, token: invalid })).ok).toBe(false)
    expect((await captureUnlock({ ...blank, email: 'invalid', token: token() })).ok).toBe(false)
    state.allowed = false
    expect((await captureUnlock({ ...blank, token: token() })).ok).toBe(false)
    expect(state.captureCalls).toBe(0)
    expect(state.rows.size).toBe(0)
  })
})
