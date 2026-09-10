import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'

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
// admin-actions.ts imports the whole cancel surface (the single-event fan-out plus the series
// cancel added for LIVE-198), so the mock declares all three: a factory that omits an export the
// module under test imports is a load-order failure waiting to happen.
vi.mock('@/lib/events/cancellation', () => ({
  refundAndNotifyForCancelledEvent: async () => undefined,
  cancelSeries: async () => ({
    seriesKey: null, considered: 0, cancelled: [], alreadyCancelled: [],
    unauthorized: [], failed: [], fanoutFailed: [], truncated: false,
  }),
  loadSeriesCancelPlan: async () => ({
    seriesKey: null, recurring: false, upcoming: [], cancellable: 0, truncated: false,
  }),
}))
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

// ─────────────────────────────────────────────────────────────────────────────
// updateEventSettings AND THE SERIES RULE (ADR-1306).
//
// 🔴 THE DEFECT THIS PINS REACHED PRODUCTION AND 500'd. Vercel runtime errors, 2026-09-10, three
// occurrences from one host on /events/[slug]:
//
//     Error: new row for relation "events" violates check constraint
//     "events_occurrence_not_recurring"
//
// That CHECK, verified on the live database, is:
//
//     CHECK (parent_event_id IS NULL OR recurrence_type = 'none')
//
// A materialised occurrence may not itself recur. This action wrote `recurrence_type` by id with
// no idea which kind of row it had, so a host who opened ONE DATE of a series and set a repeat on
// it got a 500 rather than a series.
//
// ── WHY THIS IS A SOURCE-SHAPE GUARD ────────────────────────────────────────────────────────────
// The oracle for the bug is a DATABASE CONSTRAINT, and the action reaches it through a dozen reads,
// a geocode and a details merge. Faking that chain deeply enough to make the constraint the thing
// under test would be faking the constraint, which proves nothing. What IS decidable here is the
// three shapes that keep the write off a child row, and each one is a line someone could delete
// while everything still compiles and every other test still passes. The behaviour itself was
// verified against production: the constraint above is quoted from `pg_constraint`, and the error
// it produced is quoted from the runtime log.
describe('the repeat rule belongs to the series, not to the date', () => {
  const source = readFileSync('app/(main)/events/admin-actions.ts', 'utf8')
  const fn = source.slice(source.indexOf('export async function updateEventSettings'))
  const code = fn.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '')

  it('🔴 knows whether the row it was handed is an anchor or one date of a series', () => {
    // The read that makes the rest possible. Without `parent_event_id` in the select, every clause
    // below is unwritable and the action is back to guessing.
    expect(code).toContain("'details, theme, scope_type, parent_event_id, starts_at'")
    expect(code).toContain('const seriesAnchorId = parentEventId ?? id')
  })

  it('🔴 never writes the recurrence columns onto a date of a series', () => {
    // This is the 500. The columns must be conditional on the row being an anchor.
    // The three columns appear exactly twice in the action: gated out of the row's own payload, and
    // written to the anchor. Neither may become unconditional.
    const gated = code.slice(code.indexOf('...(parentEventId'))
    expect(code, 'the recurrence columns are back to writing unconditionally').toContain('...(parentEventId')
    expect(gated.slice(0, 400)).toContain('recurrence_type: recurrence')
    expect(gated.slice(0, 400)).toContain('recurrence_rule: recurrenceRule')
    expect(gated.slice(0, 400)).toContain('recurrence_until: untilIso')
  })

  it('writes the rule to the anchor instead, fenced so it can only ever hit an anchor', () => {
    expect(code).toContain('const rulePush = async ()')
    expect(code).toContain(".is('parent_event_id', null)")
    expect(code).toContain(".eq('id', parentEventId)")
  })

  it('validates the end date against the SERIES start, not the date the host happened to open', () => {
    // An "ends on" that is valid for the series would otherwise be rejected whenever the host is
    // looking at an occurrence later than the anchor.
    expect(code).toContain('const startIsoForRec = parentEventId ? anchorStartsAt')
  })

  it('🔴 does NOT propagate after a per-date edit, which would undo what the host just typed', () => {
    // propagateAnchorEditsToOccurrences copies the ANCHOR's content onto every upcoming date. Run
    // it after an edit to ONE date and the title, venue or price just saved on that date is
    // overwritten a line later. The other two reconcilers are driven by the RULE, which is the
    // anchor's either way, so they run for both.
    expect(code).toContain('parentEventId ? 0 : propagateAnchorEditsToOccurrences(seriesAnchorId)')
    expect(code).toContain('retireStaleOccurrences(seriesAnchorId)')
    expect(code).toContain('generateOccurrencesForAnchor(seriesAnchorId)')
  })
})
