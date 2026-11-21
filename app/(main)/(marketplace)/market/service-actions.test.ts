import { describe, it, expect, beforeEach, vi } from 'vitest'

// sendServiceEnquiry (ADR-596 §3/§7) — the contact-only escape hatch. It is the one path that
// bypasses startConversation's friendship gate, so this locks the guards that stand in for
// friendship: signed-in, real contact-only service, not your own listing, not blocked, and rate
// limited. Fully network-free (every DB/seam dep is mocked; the real code branches run).
const { getMyProfileId, getProduct, getSpaceById, isBlockedBetween, rateLimitOk, findOrCreate, adminInsert } =
  vi.hoisted(() => ({
    getMyProfileId: vi.fn(),
    getProduct: vi.fn(),
    getSpaceById: vi.fn(),
    isBlockedBetween: vi.fn(),
    rateLimitOk: vi.fn(),
    findOrCreate: vi.fn(),
    adminInsert: vi.fn(),
  }))

vi.mock('@/lib/auth', () => ({ getMyProfileId, requireProfileId: getMyProfileId }))
vi.mock('@/lib/commerce/products', () => ({ getProduct }))
vi.mock('@/lib/spaces/store', () => ({ getSpaceById }))
vi.mock('@/lib/blocking', () => ({ isBlockedBetween }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk }))
vi.mock('@/lib/messages/direct-conversation', () => ({ findOrCreateDirectConversation: findOrCreate }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ insert: adminInsert }) }) }))
// Cut the checkout/booking import chain (Stripe et al.) — not exercised by the enquiry path.
vi.mock('@/lib/commerce/checkout', () => ({ createCommerceCheckout: vi.fn() }))
vi.mock('@/lib/spaces/booking', () => ({
  createBooking: vi.fn(), holdSlotForBooking: vi.fn(), linkBookingToOrder: vi.fn(), releasePendingHold: vi.fn(),
  BOOKING_CHECKOUT_SECONDS: 1800,
}))
vi.mock('@/lib/billing/connect', () => ({ payoutsLive: vi.fn() }))

import { sendServiceEnquiry } from './service-actions'

// A space-owned, active, contact-only service (the common case).
const contactService = {
  productKind: 'service',
  status: 'active',
  title: 'Deep tissue massage',
  metadata: { service: { priceModel: 'contact' } },
  ownerProfileId: null,
  ownerSpaceId: 'space-1',
}

describe('sendServiceEnquiry — guards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMyProfileId.mockResolvedValue('buyer-1')
    getProduct.mockResolvedValue({ ...contactService })
    getSpaceById.mockResolvedValue({ ownerProfileId: 'owner-1' })
    isBlockedBetween.mockResolvedValue(false)
    rateLimitOk.mockResolvedValue(true)
    findOrCreate.mockResolvedValue('conv-1')
    adminInsert.mockResolvedValue({ error: null })
  })

  it('requires sign-in', async () => {
    getMyProfileId.mockResolvedValue(null)
    expect(await sendServiceEnquiry('p-1')).toMatchObject({ error: expect.stringMatching(/sign in/i) })
  })

  it('rejects a non-service or inactive product', async () => {
    getProduct.mockResolvedValue({ ...contactService, status: 'archived' })
    expect(await sendServiceEnquiry('p-1')).toMatchObject({ error: expect.stringMatching(/not available/i) })
  })

  it('rejects a service that is not contact-only', async () => {
    getProduct.mockResolvedValue({ ...contactService, metadata: { service: { priceModel: 'fixed' } } })
    expect(await sendServiceEnquiry('p-1')).toMatchObject({ error: expect.stringMatching(/bookings/i) })
  })

  it('refuses enquiring on your own listing', async () => {
    getSpaceById.mockResolvedValue({ ownerProfileId: 'buyer-1' })
    expect(await sendServiceEnquiry('p-1')).toMatchObject({ error: expect.stringMatching(/your own/i) })
  })

  it('refuses when the two parties are blocked', async () => {
    isBlockedBetween.mockResolvedValue(true)
    expect(await sendServiceEnquiry('p-1')).toMatchObject({ error: expect.stringMatching(/cannot message/i) })
    expect(findOrCreate).not.toHaveBeenCalled()
  })

  it('refuses past the per-buyer rate limit', async () => {
    rateLimitOk.mockResolvedValue(false)
    expect(await sendServiceEnquiry('p-1')).toMatchObject({ error: expect.stringMatching(/lot of enquiries/i) })
    expect(adminInsert).not.toHaveBeenCalled()
  })

  // Returns the conversation ID, not a /messages URL: the caller opens the chat dock over the
  // listing (ADR-896). A URL here would re-create the navigation the consolidation removed.
  it('opens the thread, seeds the enquiry, and returns its conversation id', async () => {
    const res = await sendServiceEnquiry('p-1')
    expect(res).toEqual({ conversationId: 'conv-1' })
    expect(findOrCreate).toHaveBeenCalledWith(expect.anything(), 'buyer-1', 'owner-1')
    expect(adminInsert).toHaveBeenCalledWith(
      expect.objectContaining({ conversation_id: 'conv-1', sender_id: 'buyer-1', body: expect.stringContaining('Deep tissue massage') }),
    )
  })
})

// BOOK-006: a paid Market booking whose checkout fails frees its slot with the pending-hold release.
describe('bookServiceAction — a failed checkout frees the hold', () => {
  it('releases the pending hold (never cancelBooking, which left the slot held)', async () => {
    const booking = await import('@/lib/spaces/booking')
    const checkout = await import('@/lib/commerce/checkout')
    const connect = await import('@/lib/billing/connect')
    const { bookServiceAction } = await import('./service-actions')
    vi.clearAllMocks()
    getMyProfileId.mockResolvedValue('buyer-1')
    rateLimitOk.mockResolvedValue(true)
    getProduct.mockResolvedValue({
      id: 'prod-1',
      productKind: 'service',
      status: 'active',
      priceCents: 5000,
      bookingSpaceId: 'space-1',
      metadata: { service: { priceModel: 'fixed' } },
    })
    vi.mocked(connect.payoutsLive).mockResolvedValue(true)
    vi.mocked(booking.holdSlotForBooking).mockResolvedValue({ bookingId: 'hold-1', endsAt: '2099-01-01T11:00:00.000Z' })
    vi.mocked(checkout.createCommerceCheckout).mockResolvedValue({ error: 'Stripe is down' } as never)

    const res = await bookServiceAction('prod-1', '2099-01-01T10:00:00.000Z', 'Hi')
    expect(res.error).toBe('Stripe is down')
    expect(booking.holdSlotForBooking).toHaveBeenCalledWith('space-1', 'buyer-1', '2099-01-01T10:00:00.000Z', 'prod-1', { note: 'Hi' })
    expect(booking.releasePendingHold).toHaveBeenCalledWith('hold-1')
    expect(booking.linkBookingToOrder).not.toHaveBeenCalled()
  })
})
