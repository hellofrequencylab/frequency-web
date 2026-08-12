import { describe, it, expect, vi, beforeEach } from 'vitest'

// THE EVENT SEEDER — the PER-ROW ownership rule.
//
// The console gate answers "may you use this console". It does not answer "may you act on THAT
// row", and those are different questions: every per-row action used to fetch by intake id
// alone, so any operator who cleared the staff gate and held another operator's row id could
// open, edit, and seed it. The rule locked here is the caller's OWN row, or ANY row when the
// caller is a platform admin (web_role admin / janitor).
//
// Network-free: the guard, the store, the apply path, the poster signer and next/cache are
// mocked. The manifest + kernel run for real (they are pure).

const OWNER = 'op-1111-4000-a000-00000000owner'
const STRANGER = 'op-2222-4000-a000-000000stranger'
const ROW_ID = 'intake-3333-4000-a000-0000000000row'

// ── The caller: profile id + web_role, both swapped per test ─────────────────────────────────
let caller = { profileId: OWNER, webRole: 'none' as 'none' | 'admin' | 'janitor' }
vi.mock('@/lib/admin/guard', () => ({
  requireAdmin: async () => ({
    profileId: caller.profileId,
    role: 'member',
    webRole: caller.webRole,
    staffRole: 'owner',
  }),
}))

// ── The store: ONE staged row created by OWNER ───────────────────────────────────────────────
const row = {
  id: ROW_ID,
  createdBy: OWNER,
  status: 'review' as const,
  inputs: { source: 'paste' as const, sourceLabel: 'Pasted by hand', consent: { isDemo: true } },
  draft: { title: 'Sunrise swim' },
  ledger: {},
  rawSources: [],
  targetEventId: null,
  error: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z',
}

const saveEventDraft = vi.fn(async () => true)
const setEventIntakeStatus = vi.fn(async () => true)

vi.mock('@/lib/events/seed/store', () => ({
  // The caller-bound read: the row ONLY when created_by matches.
  getEventIntakeForOperator: async (id: string, operatorId: string) =>
    id === row.id && operatorId === row.createdBy ? row : null,
  // The unbound read: any row, by id alone.
  getEventIntake: async (id: string) => (id === row.id ? row : null),
  listEventIntakes: async () => [row],
  saveEventDraft: (...args: unknown[]) => saveEventDraft(...(args as [])),
  setEventIntakeStatus: (...args: unknown[]) => setEventIntakeStatus(...(args as [])),
}))

const applyEventIntake = vi.fn(async () => ({ ok: true as const, eventId: 'ev-1', alreadyApplied: false }))
vi.mock('@/lib/events/seed/apply', () => ({
  applyEventIntake: (...args: unknown[]) => applyEventIntake(...(args as [])),
}))

vi.mock('@/lib/events/poster-media', () => ({ posterSignedUrl: async () => null }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const actions = await import('./actions')

beforeEach(() => {
  caller = { profileId: OWNER, webRole: 'none' }
  saveEventDraft.mockClear()
  setEventIntakeStatus.mockClear()
  applyEventIntake.mockClear()
})

describe('event seeder — the caller may act on their own row', () => {
  it('reads the review', async () => {
    const review = await actions.getStagedEventReview(ROW_ID)
    expect(review?.id).toBe(ROW_ID)
  })

  it('edits a field', async () => {
    const res = await actions.updateStagedEventField(ROW_ID, 'title', { kind: 'edit', value: 'Sunset swim' })
    expect(res.ok).toBe(true)
    expect(saveEventDraft).toHaveBeenCalledTimes(1)
  })

  it('approves it', async () => {
    const res = await actions.approveStagedEvent(ROW_ID)
    expect(res.ok).toBe(true)
    expect(applyEventIntake).toHaveBeenCalledTimes(1)
  })

  it('sets it aside and restores it', async () => {
    expect((await actions.setAsideStagedEvent(ROW_ID)).ok).toBe(true)
    expect((await actions.restoreStagedEvent(ROW_ID)).ok).toBe(true)
    expect(setEventIntakeStatus).toHaveBeenCalledTimes(2)
  })
})

describe("event seeder — another operator's row is refused", () => {
  beforeEach(() => {
    caller = { profileId: STRANGER, webRole: 'none' }
  })

  it('will not read the review', async () => {
    expect(await actions.getStagedEventReview(ROW_ID)).toBeNull()
  })

  it('will not edit a field, and writes nothing', async () => {
    const res = await actions.updateStagedEventField(ROW_ID, 'title', { kind: 'edit', value: 'Hijacked' })
    expect(res.ok).toBe(false)
    expect(saveEventDraft).not.toHaveBeenCalled()
  })

  it('will not approve it, and never reaches apply', async () => {
    const res = await actions.approveStagedEvent(ROW_ID)
    expect(res.ok).toBe(false)
    expect(applyEventIntake).not.toHaveBeenCalled()
  })

  it('will not set it aside or restore it, and writes no status', async () => {
    expect((await actions.setAsideStagedEvent(ROW_ID)).ok).toBe(false)
    expect((await actions.restoreStagedEvent(ROW_ID)).ok).toBe(false)
    expect(setEventIntakeStatus).not.toHaveBeenCalled()
  })
})

describe("event seeder — a platform admin may act on another operator's row", () => {
  it('reads, edits, approves and moves it as an admin', async () => {
    caller = { profileId: STRANGER, webRole: 'admin' }
    expect((await actions.getStagedEventReview(ROW_ID))?.id).toBe(ROW_ID)
    expect((await actions.updateStagedEventField(ROW_ID, 'title', { kind: 'edit', value: 'Fixed up' })).ok).toBe(true)
    expect((await actions.approveStagedEvent(ROW_ID)).ok).toBe(true)
    expect((await actions.setAsideStagedEvent(ROW_ID)).ok).toBe(true)
  })

  it('reads it as a janitor too', async () => {
    caller = { profileId: STRANGER, webRole: 'janitor' }
    expect((await actions.getStagedEventReview(ROW_ID))?.id).toBe(ROW_ID)
  })
})
