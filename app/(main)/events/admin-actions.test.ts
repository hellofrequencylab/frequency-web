import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// approveEventRsvp (scan-2 L5-10): the "you're in" notice and the success return ride on the
// approval actually landing. Before this, approveRsvpById returned void, the notice was sent
// unconditionally, and the host's button reported `{ ok: true }` over a row that still said pending.
// Pinned on FAKES: what approveRsvpById answers, and whether the notice went out.
// ─────────────────────────────────────────────────────────────────────────────

const fx = vi.hoisted(() => ({
  approve: vi.fn(async (): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true })),
  notice: vi.fn(async () => undefined),
  revalidate: vi.fn(),
  caps: new Set<string>(['event.editSettings']),
}))

vi.mock('next/cache', () => ({ revalidatePath: fx.revalidate }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({}) }) }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => 'host-1' }))
vi.mock('@/lib/core/load-capabilities', () => ({ getEventCapabilities: async () => fx.caps }))
vi.mock('@/lib/events/rsvp-depth', () => ({ approveRsvpById: fx.approve }))
vi.mock('@/lib/events/guest-rsvp-email', () => ({ sendRsvpApprovedNotice: fx.notice }))
vi.mock('@/lib/admin/audit', () => ({ logAdminAction: async () => undefined }))
vi.mock('@/lib/events/cancellation', () => ({ refundAndNotifyForCancelledEvent: async () => undefined }))
vi.mock('@/lib/events/event-lifecycle', () => ({ cancelAudit: () => ({}), reinstateAudit: () => ({}) }))
vi.mock('@/lib/events/event-stats', () => ({ loadEventCoreStats: async () => null }))
vi.mock('@/lib/events/geocode', () => ({ saveEventLocation: async () => undefined }))
vi.mock('@/lib/events/geocode-provider', () => ({ nominatimGeocoder: {} }))
vi.mock('@/lib/events/poster-media', () => ({ posterSignedUrl: async () => null }))
vi.mock('@/lib/library/store', () => ({ searchSpaceLibraryImages: async () => [] }))
vi.mock('@/lib/library/event-loom', () => ({}))
vi.mock('@/app/(main)/events/[slug]/manage/load', () => ({
  loadRoster: async () => [],
  loadAnalytics: async () => ({}),
  loadPendingApprovals: async () => [],
}))

import { approveEventRsvp } from './admin-actions'

beforeEach(() => {
  fx.approve.mockReset()
  fx.approve.mockResolvedValue({ ok: true })
  fx.notice.mockClear()
  fx.revalidate.mockClear()
  fx.caps = new Set(['event.editSettings'])
})

describe('approveEventRsvp gates the notice and the success on the row changing', () => {
  it('an approval that landed sends the notice and returns ok', async () => {
    expect(await approveEventRsvp('event-1', 'my-event', 'rsvp-1')).toEqual({ ok: true })
    expect(fx.approve).toHaveBeenCalledWith('event-1', 'rsvp-1')
    expect(fx.notice).toHaveBeenCalledWith('event-1', 'rsvp-1')
    expect(fx.revalidate).toHaveBeenCalledWith('/events/my-event')
  })

  it('🔴 a refused update sends NO notice and returns the failure shape', async () => {
    fx.approve.mockResolvedValue({ ok: false, error: 'permission denied for table event_rsvps' })
    const result = await approveEventRsvp('event-1', 'my-event', 'rsvp-1')
    expect(result).toEqual({ error: 'permission denied for table event_rsvps' })
    expect(fx.notice).not.toHaveBeenCalled()
    expect(fx.revalidate).not.toHaveBeenCalled()
  })

  it('a caller without event.editSettings never reaches the update', async () => {
    fx.caps = new Set()
    expect(await approveEventRsvp('event-1', 'my-event', 'rsvp-1')).toEqual({ error: 'Unauthorized' })
    expect(fx.approve).not.toHaveBeenCalled()
    expect(fx.notice).not.toHaveBeenCalled()
  })
})
