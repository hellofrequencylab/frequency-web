import { beforeEach, describe, expect, it, vi } from 'vitest'

// EMAIL-075: the draft reminder runner against its real rule, with the database, the send gate, the suppression list
// and the outbox mocked. What it pins: two browsers' drafts for one address are one sequence about the newest draft;
// the address's log counts across its drafts; a person who already owns a Space, or turned their lifecycle email off,
// gets nothing (claimed as skipped); a read error holds the address for the next run; an address with no account is
// asked of the suppression list alone; the timing rule (an hour, local hours) still holds.

type Draft = { id: string; email: string; handle: string | null; draft: unknown; tz: string | null; step_reached: number; saved_at: string; converted_at: string | null; unsubscribed_at: string | null }

const state = vi.hoisted(() => ({
  drafts: [] as Draft[],
  log: [] as { draft_id: string; trigger_kind: string; sent_at: string }[],
  leadProfile: null as string | null,
  contactProfile: null as string | null,
  personError: false,
  ownsSpace: false,
  gate: { allowed: true, reason: 'ok' } as { allowed: boolean; reason: string },
  suppressed: false,
  inserts: [] as Record<string, unknown>[],
  enqueued: [] as { payload: Record<string, unknown>; opts: Record<string, unknown> | undefined }[],
  gateCalls: [] as string[],
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'create_space_drafts') {
        const q: Record<string, unknown> = {}
        for (const m of ['select', 'gte', 'order', 'is', 'not', 'lte']) q[m] = () => q
        q.limit = () => Promise.resolve({ data: state.drafts, error: null })
        q.delete = () => ({ lt: () => Promise.resolve({ count: 0, error: null }) })
        return q
      }
      if (table === 'create_space_draft_email_log') {
        return {
          select: () => ({ in: (_c: string, ids: string[]) => Promise.resolve({ data: state.log.filter((l) => ids.includes(l.draft_id)), error: null }) }),
          insert: (row: Record<string, unknown>) => {
            state.inserts.push(row)
            return Promise.resolve({ error: null })
          },
        }
      }
      const person = (value: string | null, col: string) => {
        const q: Record<string, unknown> = {}
        for (const m of ['select', 'eq', 'not']) q[m] = () => q
        q.limit = () => Promise.resolve(state.personError ? { data: null, error: { message: 'boom' } } : { data: value ? [{ [col]: value }] : [], error: null })
        return q
      }
      if (table === 'signup_leads') return person(state.leadProfile, 'converted_profile_id')
      if (table === 'contacts') return person(state.contactProfile, 'profile_id')
      if (table === 'spaces') {
        return { select: () => ({ in: () => ({ limit: () => Promise.resolve({ data: state.ownsSpace ? [{ id: 's1' }] : [], error: null }) }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))
vi.mock('@/lib/email', () => ({
  enqueueEmail: (payload: Record<string, unknown>, opts?: Record<string, unknown>) => {
    state.enqueued.push({ payload, opts })
    return Promise.resolve()
  },
  listUnsubscribeHeaders: () => ({ 'List-Unsubscribe': '<x>' }),
}))
vi.mock('./draft-recovery-email', () => ({
  buildDraftReminderEmail: (i: { kind: string; to: string; resumeUrl: string }) => ({ to: i.to, subject: i.kind, html: i.resumeUrl }),
}))
vi.mock('./draft-io', () => ({ draftLinkToken: (id: string) => `tok-${id}` }))
vi.mock('./builder', () => ({
  parseDraft: () => ({ hostName: 'Sam Rivers', name: 'Sam Studio', kit: 'studio' }),
  progressOf: () => 50,
}))
vi.mock('@/lib/spaces/create-wizard', () => ({ WIZARD_THEMES: [] }))
vi.mock('@/lib/spaces/store', () => ({ isSpaceSlugTaken: () => Promise.resolve(false) }))
vi.mock('@/lib/suppression', () => ({ isSuppressed: () => Promise.resolve(state.suppressed) }))
vi.mock('@/lib/comms/send-gate', () => ({
  resolveSendGate: (profileId: string) => {
    state.gateCalls.push(profileId)
    return Promise.resolve(state.gate)
  },
}))
vi.mock('@/lib/log', () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/lifecycle/cap-io', () => ({
  reserveLifecycleSend: (_admin: unknown, input: Record<string, unknown>) => {
    cap.reserved.push(input)
    return Promise.resolve(cap.answer)
  },
  releaseLifecycleSend: (_admin: unknown, key: string) => {
    cap.released.push(key)
    return Promise.resolve()
  },
}))
const cap = vi.hoisted(() => ({ answer: 'reserved' as string, reserved: [] as Record<string, unknown>[], released: [] as string[] }))

import { groupDraftsPerAddress, runDraftReminders } from './draft-recovery-io'

const LA = 'America/Los_Angeles'
const NOW = () => new Date('2026-10-27T19:30:00Z') // 12:30 PDT
const draft = (over: Partial<Draft> = {}): Draft => ({
  id: 'd1', email: 'sam@example.com', handle: 'samstudio', draft: {}, tz: LA, step_reached: 3,
  saved_at: '2026-10-27T18:00:00Z', converted_at: null, unsubscribed_at: null, ...over,
})

beforeEach(() => {
  state.drafts = [draft()]
  state.log = []
  state.leadProfile = null
  state.contactProfile = null
  state.personError = false
  state.ownsSpace = false
  state.gate = { allowed: true, reason: 'ok' }
  state.suppressed = false
  state.inserts = []
  state.enqueued = []
  state.gateCalls = []
  cap.answer = 'reserved'
  cap.reserved = []
  cap.released = []
})

const run = () => runDraftReminders({ limit: 200, now: NOW, baseUrl: 'https://frequencylocal.com' })

describe('groupDraftsPerAddress', () => {
  it('keeps the newest draft per address, case-blind, and carries an end from any of them', () => {
    const groups = groupDraftsPerAddress([
      draft({ id: 'old', saved_at: '2026-10-27T10:00:00Z', unsubscribed_at: '2026-10-27T11:00:00Z' }),
      draft({ id: 'new', email: ' Sam@Example.com ', saved_at: '2026-10-27T18:00:00Z' }),
      draft({ id: 'other', email: 'kim@example.com' }),
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({ address: 'sam@example.com', ids: ['new', 'old'], unsubscribedAt: '2026-10-27T11:00:00Z' })
    expect(groups[0].newest.id).toBe('new')
  })
})

describe('runDraftReminders', () => {
  it('sends one email about the newest draft when one address saved from two browsers', async () => {
    state.drafts = [draft({ id: 'd2', saved_at: '2026-10-27T18:20:00Z' }), draft({ id: 'd1', saved_at: '2026-10-27T18:00:00Z' })]
    const r = await run()
    expect(r).toMatchObject({ scanned: 1, sent: 1, failed: 0 })
    expect(state.inserts).toEqual([{ draft_id: 'd2', trigger_kind: 'draft_1h', message_ref: null }])
    expect(state.enqueued).toHaveLength(1)
    expect(state.enqueued[0].opts).toEqual({ dedupeKey: 'create_space_draft:d2:draft_1h' })
    expect(String(state.enqueued[0].payload.html)).toContain('draft=tok-d2')
  })

  it('counts the one-hour email sent for the other browser draft: no second one-hour email', async () => {
    state.drafts = [draft({ id: 'd2', saved_at: '2026-10-27T18:00:00Z' }), draft({ id: 'd1', saved_at: '2026-10-27T17:50:00Z' })]
    state.log = [{ draft_id: 'd1', trigger_kind: 'draft_1h', sent_at: '2026-10-27T19:05:00Z' }]
    const r = await run()
    expect(r.sent).toBe(0)
    expect(state.inserts).toHaveLength(0)
  })

  it('holds a newest draft saved under an hour ago instead of reminding about the older one', async () => {
    state.drafts = [draft({ id: 'd2', saved_at: '2026-10-27T19:00:00Z' }), draft({ id: 'd1', saved_at: '2026-10-27T18:00:00Z' })]
    const r = await run()
    expect(r.sent).toBe(0)
    expect(r.held.not_yet).toBe(1)
  })

  it('ends the sequence for the address when another of its drafts was converted', async () => {
    state.drafts = [draft({ id: 'd2' }), draft({ id: 'd1', saved_at: '2026-10-27T17:00:00Z', converted_at: '2026-10-27T17:30:00Z' })]
    const r = await run()
    expect(r.sent).toBe(0)
    expect(r.held.ended).toBe(1)
  })

  it('skips, and claims as skipped, a person who already owns a Space', async () => {
    state.leadProfile = 'p1'
    state.ownsSpace = true
    const r = await run()
    expect(r).toMatchObject({ sent: 0, skipped: 1 })
    expect(state.inserts).toEqual([{ draft_id: 'd1', trigger_kind: 'draft_1h', message_ref: 'skipped:has_space' }])
    expect(state.enqueued).toHaveLength(0)
  })

  it('honors the person own lifecycle email switch through the send gate', async () => {
    state.contactProfile = 'p1'
    state.gate = { allowed: false, reason: 'pref_off' }
    const r = await run()
    expect(r).toMatchObject({ sent: 0, skipped: 1 })
    expect(state.gateCalls).toEqual(['p1'])
    expect(state.inserts[0]).toMatchObject({ message_ref: 'skipped:pref_off' })
  })

  it('sends to a person with an account, no Space and the switch on', async () => {
    state.leadProfile = 'p1'
    expect((await run()).sent).toBe(1)
    expect(state.gateCalls).toEqual(['p1'])
  })

  it('holds the address, without claiming, when the person read fails or the gate cannot be read', async () => {
    state.personError = true
    let r = await run()
    expect(r.held.person_error).toBe(1)
    state.personError = false
    state.leadProfile = 'p1'
    state.gate = { allowed: false, reason: 'error' }
    r = await run()
    expect(r.held.person_error).toBe(1)
    expect(state.inserts).toHaveLength(0)
    expect(state.enqueued).toHaveLength(0)
  })

  it('asks the suppression list alone for an address with no account', async () => {
    state.suppressed = true
    const r = await run()
    expect(r).toMatchObject({ sent: 0, skipped: 1 })
    expect(state.inserts[0]).toMatchObject({ message_ref: 'skipped:suppressed' })
    expect(state.gateCalls).toHaveLength(0)
  })

  // EMAIL-064: the reminder counts toward the one a day, three a week cap.
  it('reserves through the lifecycle cap with the registry kind and a stable key before it sends', async () => {
    state.leadProfile = 'p1'
    expect((await run()).sent).toBe(1)
    expect(cap.reserved).toEqual([{ recipient: 'sam@example.com', profileId: 'p1', kind: 'create_space_draft', dedupeKey: 'create_space_draft:d1:draft_1h' }])
  })

  it('leaves a capped or errored reminder due for a later run: no log claim, no send', async () => {
    for (const answer of ['capped', 'error']) {
      cap.answer = answer
      const r = await run()
      expect(r.sent).toBe(0)
      expect(r.held[answer === 'capped' ? 'capped' : 'cap_error']).toBe(1)
    }
    expect(state.inserts).toHaveLength(0)
    expect(state.enqueued).toHaveLength(0)
  })

  it('claims the kind without a second send when the cap says it already went out', async () => {
    cap.answer = 'duplicate'
    const r = await run()
    expect(r).toMatchObject({ sent: 0, lost: 1 })
    expect(state.inserts).toEqual([{ draft_id: 'd1', trigger_kind: 'draft_1h', message_ref: null }])
    expect(state.enqueued).toHaveLength(0)
  })

  it('does not spend the cap on a skipped kind', async () => {
    state.suppressed = true
    await run()
    expect(cap.reserved).toHaveLength(0)
  })

  it('still holds a due email outside 8am to 8pm in the browser zone', async () => {
    const r = await runDraftReminders({ limit: 200, now: () => new Date('2026-10-28T05:00:00Z'), baseUrl: 'https://frequencylocal.com' })
    expect(r.sent).toBe(0)
    expect(state.inserts).toHaveLength(0)
  })
})
