import { beforeEach, describe, expect, it, vi } from 'vitest'

// VLS-26 / VLS-27: the runner against its real rule and real email builder, with only the database, the send gate and the
// outbox mocked. What it pins: a due launch is gated, claimed (a unique log row) BEFORE it is enqueued, and sent once; an
// opt-out is logged as a skipped kind and sends nothing; a lost claim sends nothing; a launch with no known zone is held;
// a launch that came back after an email is held for good.

const state = vi.hoisted(() => ({
  launches: [] as Record<string, unknown>[],
  log: [] as { launch_id: string; trigger_kind: string; sent_at: string; message_ref?: string | null }[],
  profile: { display_name: 'Sam Rivers', auth_user_id: 'u1', home_timezone: 'America/Los_Angeles' } as Record<string, unknown>,
  spaceZone: null as string | null,
  email: 'sam@example.com' as string | null,
  gate: { allowed: true, reason: 'ok' } as { allowed: boolean; reason: string },
  claimCode: null as string | null,
  inserts: [] as Record<string, unknown>[],
  enqueued: [] as { payload: Record<string, unknown>; opts: Record<string, unknown> | undefined }[],
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'space_launch') {
        const q: Record<string, unknown> = {}
        for (const m of ['select', 'is', 'lte', 'gte', 'order']) q[m] = () => q
        q.limit = () => Promise.resolve({ data: state.launches, error: null })
        return q
      }
      if (table === 'launch_email_log') {
        return {
          select: () => ({ in: () => Promise.resolve({ data: state.log, error: null }) }),
          insert: (row: Record<string, unknown>) => {
            state.inserts.push(row)
            return Promise.resolve({ error: state.claimCode ? { code: state.claimCode, message: 'x' } : null })
          },
        }
      }
      if (table === 'profiles') return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: state.profile }) }) }) }
      if (table === 'spaces') return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { time_zone: state.spaceZone } }) }) }) }
      throw new Error(`unexpected table ${table}`)
    },
    auth: { admin: { getUserById: () => Promise.resolve({ data: { user: state.email ? { email: state.email } : null } }) } },
  }),
}))
vi.mock('@/lib/email', () => ({
  enqueueEmail: (payload: Record<string, unknown>, opts?: Record<string, unknown>) => {
    state.enqueued.push({ payload, opts })
    return Promise.resolve()
  },
  listUnsubscribeHeaders: () => ({ 'List-Unsubscribe': '<x>' }),
  emailShell: (body: string) => body,
  emailButton: (label: string, href: string) => `<a href="${href}">${label}</a>`,
  escapeHtml: (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  EMAIL_H1: '',
  EMAIL_MUTED: '',
  EMAIL_P: '',
}))
vi.mock('@/lib/comms/send-gate', () => ({ resolveSendGate: () => Promise.resolve(state.gate) }))
vi.mock('@/lib/unsubscribe-tokens', () => ({ buildUnsubscribeUrl: () => 'https://frequencylocal.com/unsubscribe?x=1' }))
vi.mock('@/lib/log', () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))
// EMAIL-064: the cross-email cap. 'reserved' unless a test says otherwise (what the real module answers with the cap off).
const cap = vi.hoisted(() => ({ answer: 'reserved' as string, reserved: [] as Record<string, unknown>[], released: [] as string[] }))
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

import { runLaunchComebacks } from './comeback-io'

const STOP = '2026-10-27T18:00:00Z' // 11:00 PDT
const NOW = () => new Date('2026-10-27T19:30:00Z') // 12:30 PDT, an hour and a half later
const launchRow = (over: Record<string, unknown> = {}) => ({
  id: 'l1', owner_id: 'p1', space_id: null, niche: 'coaches', started_at: '2026-10-27T17:00:00Z', updated_at: STOP,
  steps: { spotlight: { status: 'published' } }, clock_active_ms: 4 * 60_000 + 18_000, clock_last_beat_at: STOP, ...over,
})

beforeEach(() => {
  state.launches = [launchRow()]
  state.log = []
  state.profile = { display_name: 'Sam Rivers', auth_user_id: 'u1', home_timezone: 'America/Los_Angeles' }
  state.spaceZone = null
  state.email = 'sam@example.com'
  state.gate = { allowed: true, reason: 'ok' }
  state.claimCode = null
  state.inserts = []
  state.enqueued = []
  cap.answer = 'reserved'
  cap.reserved = []
  cap.released = []
})

const run = () => runLaunchComebacks({ limit: 200, now: NOW, baseUrl: 'https://frequencylocal.com' })

describe('runLaunchComebacks', () => {
  it('sends the one-hour email once, with the time left and the /launch/resume link, claimed first', async () => {
    const r = await run()
    expect(r).toMatchObject({ scanned: 1, sent: 1, skipped: 0, failed: 0 })
    expect(state.inserts).toEqual([{ launch_id: 'l1', trigger_kind: 'comeback_1h', message_ref: null }])
    expect(state.enqueued).toHaveLength(1)
    const { payload, opts } = state.enqueued[0]
    expect(payload.to).toBe('sam@example.com')
    expect(String(payload.html)).toContain('7:42')
    expect(String(payload.html)).toContain('https://frequencylocal.com/launch/resume')
    expect(String(payload.html)).toContain('Hi Sam,')
    expect(payload.headers).toEqual({ 'List-Unsubscribe': '<x>' })
    expect(opts).toEqual({ dedupeKey: 'launch_comeback:l1:comeback_1h' })
  })

  it('sends nothing and logs a skipped kind when the person has unsubscribed or turned the category off', async () => {
    state.gate = { allowed: false, reason: 'pref_off' }
    const r = await run()
    expect(r).toMatchObject({ sent: 0, skipped: 1 })
    expect(state.inserts).toEqual([{ launch_id: 'l1', trigger_kind: 'comeback_1h', message_ref: 'skipped:pref_off' }])
    expect(state.enqueued).toHaveLength(0)
  })

  it('retries next run, without logging, when the gate could not be read', async () => {
    state.gate = { allowed: false, reason: 'error' }
    const r = await run()
    expect(r).toMatchObject({ sent: 0, skipped: 0 })
    expect(r.held.gate_error).toBe(1)
    expect(state.inserts).toHaveLength(0)
  })

  it('sends nothing when another run already claimed the kind', async () => {
    state.claimCode = '23505'
    const r = await run()
    expect(r).toMatchObject({ sent: 0, lost: 1, failed: 0 })
    expect(state.enqueued).toHaveLength(0)
  })

  it('counts a failed claim so the heartbeat sees it, and does not send', async () => {
    state.claimCode = '42501'
    const r = await run()
    expect(r).toMatchObject({ sent: 0, failed: 1 })
    expect(state.enqueued).toHaveLength(0)
  })

  it('holds the email when no time zone is known anywhere, rather than guess', async () => {
    state.profile = { ...state.profile, home_timezone: null }
    const r = await run()
    expect(r.sent).toBe(0)
    expect(r.held.no_zone).toBe(1)
    expect(state.inserts).toHaveLength(0)
  })

  it('falls back to the Space time zone', async () => {
    state.profile = { ...state.profile, home_timezone: null }
    state.spaceZone = 'America/Los_Angeles'
    state.launches = [launchRow({ space_id: 's1' })]
    expect((await run()).sent).toBe(1)
  })

  it('holds a due email outside 8am to 8pm in their zone', async () => {
    const r = await runLaunchComebacks({ limit: 200, now: () => new Date('2026-10-28T05:00:00Z'), baseUrl: 'https://frequencylocal.com' }) // 10pm PDT
    expect(r.sent).toBe(0)
    expect(state.inserts).toHaveLength(0)
  })

  it('stops after they resume: activity later than the last email sends nothing more', async () => {
    state.log = [{ launch_id: 'l1', trigger_kind: 'comeback_1h', sent_at: '2026-10-26T20:00:00Z' }]
    const r = await run()
    expect(r.sent).toBe(0)
    expect(r.held.resumed).toBe(1)
  })

  it('sends nothing for a launch whose owner has no address', async () => {
    state.email = null
    const r = await run()
    expect(r).toMatchObject({ sent: 0, skipped: 1 })
    expect(state.inserts[0]).toMatchObject({ message_ref: 'skipped:no_email' })
  })

  it('reserves through the lifecycle cap with the registry kind and the outbox key before it sends (EMAIL-064)', async () => {
    expect((await run()).sent).toBe(1)
    expect(cap.reserved).toEqual([{ recipient: 'sam@example.com', profileId: 'p1', kind: 'launch_comeback', dedupeKey: 'launch_comeback:l1:comeback_1h' }])
  })

  it('leaves a capped or errored come-back due for a later run: no log claim, no send (EMAIL-064)', async () => {
    for (const answer of ['capped', 'error']) {
      cap.answer = answer
      const r = await run()
      expect(r.sent).toBe(0)
      expect(r.held[answer === 'capped' ? 'capped' : 'cap_error']).toBe(1)
    }
    expect(state.inserts).toHaveLength(0)
    expect(state.enqueued).toHaveLength(0)
  })

  it('claims the kind without a second send when the cap says it already went out (EMAIL-064)', async () => {
    cap.answer = 'duplicate'
    const r = await run()
    expect(r).toMatchObject({ sent: 0, lost: 1 })
    expect(state.inserts).toEqual([{ launch_id: 'l1', trigger_kind: 'comeback_1h', message_ref: null }])
    expect(state.enqueued).toHaveLength(0)
  })

  it('gives the reservation back when the claim fails for a reason other than a race (EMAIL-064)', async () => {
    state.claimCode = '42501'
    await run()
    expect(cap.released).toEqual(['launch_comeback:l1:comeback_1h'])
  })

  it('does not spend the cap on an opt-out (EMAIL-064)', async () => {
    state.gate = { allowed: false, reason: 'pref_off' }
    await run()
    expect(cap.reserved).toHaveLength(0)
  })

  it('stops early and reports what it left when the clock runs out', async () => {
    state.launches = [launchRow(), launchRow({ id: 'l2' })]
    const r = await runLaunchComebacks({ limit: 200, now: NOW, exhausted: () => true })
    expect(r).toMatchObject({ sent: 0, remaining: 2 })
  })
})
