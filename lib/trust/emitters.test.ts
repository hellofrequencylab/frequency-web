import { describe, it, expect, vi, beforeEach } from 'vitest'

// LIVE-679: marketplace, moderation and verification emit trust signals, once per record, and an
// emit failure never reaches the sale, the decision or the verification.

const calls = vi.hoisted(() => ({ list: [] as Record<string, unknown>[], fail: false }))
vi.mock('./index', () => ({
  trustSource: (source: string) => ({
    source,
    signal: async (input: Record<string, unknown>) => {
      if (calls.fail) throw new Error('down')
      calls.list.push({ source, ...input })
      return { recorded: true }
    },
  }),
}))

const { emitDealCompleted, emitDisputeLost, emitReportUpheld, emitMemberSuspended, emitOrgVerified, reportedProfileId } =
  await import('./emitters')

function admin(rows: Record<string, Record<string, unknown>>) {
  return {
    from: (table: string) => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: rows[table] ?? null, error: null }) }
      return q
    },
  } as never
}

beforeEach(() => {
  calls.list = []
  calls.fail = false
})

describe('trust emitters', () => {
  it('credits each seller on a closed order once, keyed on the order and seller', async () => {
    await emitDealCompleted('o1', ['s1', null, 's2', 's1'])
    expect(calls.list.map((c) => [c.source, c.signalType, c.profileId, c.idempotencyKey])).toEqual([
      ['marketplace', 'deal_completed', 's1', 'deal-completed:o1:s1'],
      ['marketplace', 'deal_completed', 's2', 'deal-completed:o1:s2'],
    ])
  })

  it('penalises the seller on a lost dispute, keyed on the dispute', async () => {
    await emitDisputeLost({ id: 'o1', owner_profile_id: 's1' }, 'dp_1')
    expect(calls.list[0]).toMatchObject({ source: 'marketplace', signalType: 'dispute_lost', profileId: 's1', idempotencyKey: 'dispute-lost:dp_1' })
  })

  it('finds who a report is about and penalises them once per report', async () => {
    const db = admin({ posts: { author_id: 'a1' }, events: { host_id: 'h1' }, spotlight_guestbook: { signer_profile_id: 'g1' } })
    expect(await reportedProfileId(db, { target_type: 'comment', target_id: 'x' })).toBe('a1')
    expect(await reportedProfileId(db, { target_type: 'event', target_id: 'x' })).toBe('h1')
    expect(await reportedProfileId(db, { target_type: 'guestbook', target_id: 'x' })).toBe('g1')
    expect(await reportedProfileId(db, { target_type: 'member', target_id: 'm1' })).toBe('m1')
    await emitReportUpheld(db, { id: 'r1', target_type: 'post', target_id: 'p1' })
    expect(calls.list[0]).toMatchObject({ source: 'moderation', signalType: 'report_upheld', profileId: 'a1', idempotencyKey: 'report-upheld:r1' })
  })

  it('records a suspension and a verified Non Profit', async () => {
    await emitMemberSuspended('m1', 'r2')
    await emitOrgVerified({ id: 'v1', submittedBy: 'o1', spaceId: 'sp1' })
    expect(calls.list.map((c) => c.idempotencyKey)).toEqual(['suspended:r2', 'org-verified:v1'])
  })

  it('never throws when the ledger is down', async () => {
    calls.fail = true
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(emitDealCompleted('o1', ['s1'])).resolves.toBeUndefined()
    await expect(emitMemberSuspended('m1', 'r1')).resolves.toBeUndefined()
    spy.mockRestore()
  })
})
