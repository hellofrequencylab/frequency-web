import { beforeEach, describe, expect, it, vi } from 'vitest'

const fx = vi.hoisted(() => ({
  capture: vi.fn(), headers: vi.fn(), rateLimit: vi.fn(),
}))
vi.mock('next/headers', () => ({ headers: fx.headers }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: fx.rateLimit }))
vi.mock('@/lib/crm/lead-capture', async (importActual) => ({
  ...await importActual<typeof import('@/lib/crm/lead-capture')>(),
  captureEventLead: fx.capture,
}))
import { captureCheckIn } from '@/app/(capture)/checkin/actions'
import { makeLeadLinkPayload, signLeadLink } from '@/lib/crm/lead-links'

const blank = { name: ' Jo ', email: ' JO@example.com ', phone: '', company: '' }
const token = () => signLeadLink(makeLeadLinkPayload({ s: 'space-1', d: 'event', w: 'Sunday Sit', tr: 'vip' }))

beforeEach(() => {
  process.env.OPTIN_CONFIRM_SECRET = 'test-guest-receipt-secret-0123456789'
  vi.resetAllMocks()
  fx.headers.mockResolvedValue(new Map([['x-forwarded-for', '192.0.2.1, 192.0.2.2']]))
  fx.rateLimit.mockResolvedValue(true)
  fx.capture.mockResolvedValue({ contactId: 'contact-1', firstTouch: true })
})

describe('guest event contact receipt', () => {
  it('describes the contact receipt without claiming verified attendance', async () => {
    const result = await captureCheckIn({ ...blank, token: token() })
    expect(result).toEqual({ ok: true, heading: 'Thanks for coming.', message: 'The host has your contact information. Ask your host if you need attendance confirmation.' })
    expect(fx.capture).toHaveBeenCalledWith({ spaceId: 'space-1', email: 'jo@example.com', phone: null, displayName: 'Jo', eventTitle: 'Sunday Sit', tier: 'vip' })
    expect(fx.rateLimit).toHaveBeenCalledWith('lead_checkin', '192.0.2.1', 12, '10 m')
  })
  it('gives existing and new contacts the same receipt', async () => {
    const created = await captureCheckIn({ ...blank, token: token() })
    fx.capture.mockResolvedValue({ contactId: 'contact-2', firstTouch: false })
    expect(await captureCheckIn({ ...blank, token: token() })).toEqual(created)
  })
  it('returns a visible generic retry error on a null save or capacity refusal', async () => {
    fx.capture.mockResolvedValue(null)
    expect(await captureCheckIn({ ...blank, token: token() })).toEqual({ ok: false, error: "We couldn't save your details. Please try again or ask the host for help." })
  })
  it('uses that same generic error for a rejected save without leaking provider details', async () => {
    fx.capture.mockRejectedValue(new Error('private storage detail'))
    expect(await captureCheckIn({ ...blank, token: token() })).toEqual({ ok: false, error: "We couldn't save your details. Please try again or ask the host for help." })
  })
  it('returns a retry result if request headers fail', async () => {
    fx.headers.mockRejectedValue(new Error('request unavailable'))
    expect((await captureCheckIn({ ...blank, token: token() })).ok).toBe(false)
    expect(fx.capture).not.toHaveBeenCalled()
  })
  it('returns a retry result if rate-limit storage rejects', async () => {
    fx.rateLimit.mockRejectedValue(new Error('rate storage unavailable'))
    expect((await captureCheckIn({ ...blank, token: token() })).ok).toBe(false)
    expect(fx.capture).not.toHaveBeenCalled()
  })
  it('keeps rate-limited attempts refused without a capture', async () => {
    fx.rateLimit.mockResolvedValue(false)
    expect(await captureCheckIn({ ...blank, token: token() })).toEqual({ ok: false, error: 'Too many tries. Give it a few minutes and try again.' })
    expect(fx.capture).not.toHaveBeenCalled()
  })
  it('keeps the intentional honeypot success identical and skips token, headers and storage', async () => {
    const success = await captureCheckIn({ ...blank, token: token() })
    vi.clearAllMocks()
    expect(await captureCheckIn({ ...blank, token: 'forged', company: 'bot' })).toEqual(success)
    expect(fx.capture).not.toHaveBeenCalled()
    expect(fx.headers).not.toHaveBeenCalled()
    expect(fx.rateLimit).not.toHaveBeenCalled()
  })
  it('refuses forged tokens without capture', async () => {
    expect((await captureCheckIn({ ...blank, token: 'forged' })).ok).toBe(false)
    expect(fx.capture).not.toHaveBeenCalled()
  })
  it('refuses other signed doors without capture', async () => {
    const wrongDoor = signLeadLink(makeLeadLinkPayload({ s: 'space-1', d: 'share_back' }))
    expect((await captureCheckIn({ ...blank, token: wrongDoor })).ok).toBe(false)
    expect(fx.capture).not.toHaveBeenCalled()
  })
  it('keeps invalid email validation before all storage calls', async () => {
    expect((await captureCheckIn({ ...blank, email: 'invalid', token: token() })).ok).toBe(false)
    expect(fx.capture).not.toHaveBeenCalled()
    expect(fx.rateLimit).not.toHaveBeenCalled()
  })
})
