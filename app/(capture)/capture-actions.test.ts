import { describe, it, expect, vi, beforeEach } from 'vitest'

// Deterministic signing secret for the real token lib (parseLeadLink runs inside the actions).
process.env.OPTIN_CONFIRM_SECRET = process.env.OPTIN_CONFIRM_SECRET || 'test-lead-link-secret-0123456789'

// Public capture endpoints are unauthenticated: stub the request headers + fail-open rate limiter, and
// SPY the engine so we assert the action's WIRING (token -> right door + consent posture, honeypot,
// validation, anti-forgery) without any DB.
vi.mock('next/headers', () => ({ headers: async () => new Map([['x-forwarded-for', '1.2.3.4']]) }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: vi.fn(async () => true) }))
vi.mock('@/lib/crm/lead-capture', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/crm/lead-capture')>()
  return {
    ...actual,
    captureLeadMagnet: vi.fn(async () => ({ contactId: 'c1', firstTouch: true })),
    captureEventLead: vi.fn(async () => ({ contactId: 'c1', firstTouch: true })),
    captureShareBack: vi.fn(async () => ({ contactId: 'c1', firstTouch: true })),
    acceptWarmIntro: vi.fn(async () => true),
  }
})

import { signLeadLink, makeLeadLinkPayload } from '@/lib/crm/lead-links'
import { captureLeadMagnet, captureEventLead, captureShareBack, acceptWarmIntro } from '@/lib/crm/lead-capture'
import { captureUnlock } from './unlock/actions'
import { captureCheckIn } from './checkin/actions'
import { captureExchange } from './exchange/actions'
import { acceptIntro } from './intro/actions'

const tok = (draft: Parameters<typeof makeLeadLinkPayload>[0]) => signLeadLink(makeLeadLinkPayload(draft))
const blank = { name: 'Jo', email: 'jo@example.com', phone: '', company: '' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('door 4 — lead magnet unlock (consent-native, mailable)', () => {
  it('captures via the magnet door with the token label, and reveals the resource', async () => {
    const token = tok({ s: 'space-1', d: 'lead_magnet', l: 'Free guide', r: 'https://example.com/g.pdf' })
    const res = await captureUnlock({ ...blank, token })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.link?.href).toBe('https://example.com/g.pdf')
    expect(captureLeadMagnet).toHaveBeenCalledTimes(1)
    expect(captureLeadMagnet).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 'space-1', email: 'jo@example.com', magnetLabel: 'Free guide' }),
    )
  })

  it('honeypot: same success, but nothing is captured', async () => {
    const token = tok({ s: 'space-1', d: 'lead_magnet', l: 'Free guide' })
    const res = await captureUnlock({ ...blank, company: 'bot-corp', token })
    expect(res.ok).toBe(true)
    expect(captureLeadMagnet).not.toHaveBeenCalled()
  })

  it('rejects a bad email and a wrong-door / forged token', async () => {
    expect((await captureUnlock({ ...blank, email: 'nope', token: 'x' })).ok).toBe(false)
    const eventToken = tok({ s: 'space-1', d: 'event' })
    expect((await captureUnlock({ ...blank, token: eventToken })).ok).toBe(false)
    expect(captureLeadMagnet).not.toHaveBeenCalled()
  })
})

describe('door 3 — event check-in (not mailable)', () => {
  it('captures via the event door with the tier from the token', async () => {
    const token = tok({ s: 'space-1', d: 'event', w: 'Sunday Sit', tr: 'vip' })
    const res = await captureCheckIn({ ...blank, token })
    expect(res.ok).toBe(true)
    expect(captureEventLead).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 'space-1', eventTitle: 'Sunday Sit', tier: 'vip' }),
    )
  })
})

describe('door 5 — share-back (not mailable, reciprocal reveal)', () => {
  it('captures via the share-back door and hands back the card', async () => {
    const token = tok({ s: 'space-1', d: 'share_back', by: 'The Lab', l: 'Breathwork in Encinitas' })
    const res = await captureExchange({ ...blank, token })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.card?.name).toBe('The Lab')
    expect(captureShareBack).toHaveBeenCalledWith(expect.objectContaining({ spaceId: 'space-1' }))
  })
})

describe('door 2 — warm intro accept (the opt-in)', () => {
  it('flips the sealed lead via acceptWarmIntro with the token space + contact', async () => {
    const token = tok({ s: 'space-1', d: 'warm_intro', c: 'contact-9', by: 'The Lab' })
    const res = await acceptIntro(token)
    expect(res.ok).toBe(true)
    expect(acceptWarmIntro).toHaveBeenCalledWith('space-1', 'contact-9')
  })

  it('rejects a warm-intro token with no sealed contact', async () => {
    const token = tok({ s: 'space-1', d: 'warm_intro', by: 'The Lab' })
    const res = await acceptIntro(token)
    expect(res.ok).toBe(false)
    expect(acceptWarmIntro).not.toHaveBeenCalled()
  })
})
