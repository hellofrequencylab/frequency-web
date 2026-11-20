import { beforeEach, describe, expect, it, vi } from 'vitest'

// EMAIL-064: the launched welcome counts toward the one a day, three a week cap. It is rank 1 (the daily cap never holds
// it), but a full week does, and the reservation comes BEFORE the launch_email_log claim so a held welcome is not
// recorded as sent. The database, gate, inventory, builder and outbox are mocked; only the order of the calls is pinned.

const state = vi.hoisted(() => ({
  gate: { allowed: true, reason: 'ok' } as { allowed: boolean; reason: string },
  email: 'sam@example.com' as string | null,
  claimCode: null as string | null,
  inserts: [] as Record<string, unknown>[],
  enqueued: [] as { payload: Record<string, unknown>; opts: Record<string, unknown> | undefined }[],
  enqueueThrows: false,
  cap: 'reserved' as string,
  reserved: [] as Record<string, unknown>[],
  released: [] as string[],
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'launch_email_log') throw new Error(`unexpected table ${table}`)
      return {
        insert: (row: Record<string, unknown>) => {
          state.inserts.push(row)
          return Promise.resolve({ error: state.claimCode ? { code: state.claimCode, message: 'x' } : null })
        },
      }
    },
  }),
}))
vi.mock('./comeback-io', () => ({ readOwner: () => Promise.resolve({ email: state.email, firstName: 'Sam', timeZone: 'America/Los_Angeles' }) }))
vi.mock('./inventory-io', () => ({ loadInventory: () => Promise.resolve(null) }))
vi.mock('./next-best-step', () => ({ nextBestStep: () => null }))
vi.mock('./launched-email', () => ({
  LAUNCHED_KIND: 'launched_welcome',
  buildLaunchedEmail: (p: { to: string }) => ({ to: p.to, subject: 'You are live', html: '<p>live</p>' }),
}))
vi.mock('@/lib/email', () => ({
  enqueueEmail: (payload: Record<string, unknown>, opts?: Record<string, unknown>) => {
    if (state.enqueueThrows) return Promise.reject(new Error('outbox down'))
    state.enqueued.push({ payload, opts })
    return Promise.resolve()
  },
  listUnsubscribeHeaders: () => ({ 'List-Unsubscribe': '<x>' }),
}))
vi.mock('@/lib/comms/send-gate', () => ({ resolveSendGate: () => Promise.resolve(state.gate) }))
vi.mock('@/lib/unsubscribe-tokens', () => ({ buildUnsubscribeUrl: () => 'https://frequencylocal.com/unsubscribe?x=1' }))
vi.mock('@/lib/log', () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/lifecycle/cap-io', () => ({
  reserveLifecycleSend: (_admin: unknown, input: Record<string, unknown>) => {
    state.reserved.push(input)
    return Promise.resolve(state.cap)
  },
  releaseLifecycleSend: (_admin: unknown, key: string) => {
    state.released.push(key)
    return Promise.resolve()
  },
}))

import { sendLaunchedWelcome } from './launched-io'
import type { LaunchSnapshot } from './state'

const launch = { id: 'l1', ownerId: 'p1', spaceId: 's1', niche: 'coaches', intents: [], skippedPhotos: [] } as unknown as LaunchSnapshot
const send = () => sendLaunchedWelcome(launch, { slug: 'sam', name: 'Sam Studio' }, 'https://frequencylocal.com')

beforeEach(() => {
  state.gate = { allowed: true, reason: 'ok' }
  state.email = 'sam@example.com'
  state.claimCode = null
  state.inserts = []
  state.enqueued = []
  state.enqueueThrows = false
  state.cap = 'reserved'
  state.reserved = []
  state.released = []
})

describe('sendLaunchedWelcome and the cross-email cap', () => {
  it('reserves with the registry kind and the outbox key, then claims and sends', async () => {
    expect(await send()).toBe('sent')
    expect(state.reserved).toEqual([{ recipient: 'sam@example.com', profileId: 'p1', kind: 'launched_welcome', dedupeKey: 'launch_welcome:l1' }])
    expect(state.inserts).toEqual([{ launch_id: 'l1', trigger_kind: 'launched_welcome', message_ref: null }])
    expect(state.enqueued[0].opts).toEqual({ dedupeKey: 'launch_welcome:l1' })
  })

  it('a capped welcome is not claimed and not sent', async () => {
    state.cap = 'capped'
    expect(await send()).toBe('skipped')
    expect(state.inserts).toEqual([])
    expect(state.enqueued).toEqual([])
  })

  it('a cap read error is a failure, not a claim', async () => {
    state.cap = 'error'
    expect(await send()).toBe('failed')
    expect(state.inserts).toEqual([])
  })

  it('a duplicate reservation means it already went out', async () => {
    state.cap = 'duplicate'
    expect(await send()).toBe('already')
    expect(state.enqueued).toEqual([])
  })

  it('an opt-out is claimed as skipped without spending the cap', async () => {
    state.gate = { allowed: false, reason: 'pref_off' }
    expect(await send()).toBe('skipped')
    expect(state.reserved).toEqual([])
    expect(state.inserts[0]).toMatchObject({ message_ref: 'skipped:pref_off' })
  })

  it('gives the reservation back when the outbox refuses the send', async () => {
    state.enqueueThrows = true
    expect(await send()).toBe('failed')
    expect(state.released).toEqual(['launch_welcome:l1'])
  })
})
