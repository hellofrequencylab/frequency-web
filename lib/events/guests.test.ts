import { describe, it, expect, beforeEach, vi } from 'vitest'

// Event-invite capture loop orchestrator (ADR-154). What is locked here (network-free —
// the admin client + root-space seam are mocked):
//   1. TRIPLE-WRITE: one guest lands in event_guests, the inviter's network_contacts
//      (source='event', visibility='private'), and the marketing contacts DB
//      (consent_state='unknown', source='event', ADDED never mailed), linked back.
//   2. PERSONAL DEDUPE: a resubmit refreshes the inviter's card, never duplicates it.
//   3. NO DOWNGRADE: an existing subscribed/member marketing contact keeps its own
//      consent_state + source (touch only).
//   4. FAILURE ISOLATION: a failed guest leg does not stop the personal leg; a failed
//      marketing leg never fails the capture (priority legs define ok).

interface Row {
  id: string
  [k: string]: unknown
}

const store = {
  event_guests: [] as Row[],
  network_contacts: [] as Row[],
  contacts: [] as Row[],
  nextId: 1,
  fail: {} as Record<string, boolean>,
}

function tableArr(table: string): Row[] {
  return store[table as 'event_guests' | 'network_contacts' | 'contacts']
}

function builder(table: string) {
  const filters: Record<string, unknown> = {}
  let op: 'select' | 'insert' | 'update' = 'select'
  let payload: Record<string, unknown> = {}

  const match = (r: Row) =>
    Object.entries(filters).every(([k, v]) =>
      k === 'email' ? String(r.email ?? '').toLowerCase() === String(v).toLowerCase() : r[k] === v,
    )

  const doInsert = () => {
    if (store.fail[`${table}_insert`]) throw new Error(`${table} insert failed`)
    const row: Row = { id: `${table[0]}${store.nextId++}`, created_at: '2026-07-17T00:00:00Z', ...payload }
    tableArr(table).push(row)
    return { data: { id: row.id }, error: null }
  }
  const doUpdate = () => {
    if (store.fail[`${table}_update`]) throw new Error(`${table} update failed`)
    for (const r of tableArr(table).filter(match)) Object.assign(r, payload)
    return { data: null, error: null }
  }
  const doSelect = () => {
    if (store.fail[`${table}_select`]) throw new Error(`${table} select failed`)
    return { data: tableArr(table).filter(match)[0] ?? null, error: null }
  }

  const api = {
    select() {
      return api
    },
    insert(p: Record<string, unknown>) {
      op = 'insert'
      payload = p
      return api
    },
    update(p: Record<string, unknown>) {
      op = 'update'
      payload = p
      return api
    },
    eq(c: string, v: unknown) {
      filters[c] = v
      return api
    },
    order() {
      return api
    },
    limit() {
      return api
    },
    maybeSingle() {
      if (op === 'insert') return Promise.resolve(doInsert())
      if (op === 'update') return Promise.resolve(doUpdate())
      return Promise.resolve(doSelect())
    },
    // Update legs are awaited directly (no maybeSingle) — make the builder thenable.
    then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
      try {
        const out = op === 'update' ? doUpdate() : op === 'insert' ? doInsert() : doSelect()
        return Promise.resolve(out).then(resolve, reject)
      } catch (e) {
        return Promise.reject(e).then(resolve, reject)
      }
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => builder(table) }),
}))
vi.mock('@/lib/spaces/store', () => ({
  loadRootSpaceId: () => Promise.resolve('root-space'),
}))

import { captureEventGuest } from './guests'

const INVITER = 'inviter-0000-4000-a000-00000000invt'
const EVENT = 'event-00000-4000-a000-00000000evnt'

beforeEach(() => {
  store.event_guests = []
  store.network_contacts = []
  store.contacts = []
  store.nextId = 1
  store.fail = {}
})

const base = { inviterProfileId: INVITER, eventId: EVENT, displayName: 'Sam Guest', email: 'Sam@Example.com' }

describe('captureEventGuest — triple-write', () => {
  it('writes the guest, the inviter personal card, and a consent-unknown marketing contact', async () => {
    const res = await captureEventGuest({ ...base, phone: '555-1234', rsvpStatus: 'going' })
    expect(res.ok).toBe(true)

    expect(store.event_guests).toHaveLength(1)
    const g = store.event_guests[0]!
    expect(g.event_id).toBe(EVENT)
    expect(g.inviter_profile_id).toBe(INVITER)
    expect(g.source).toBe('event_qr')
    expect(g.rsvp_status).toBe('going')
    expect(g.email).toBe('sam@example.com') // normalized

    expect(store.network_contacts).toHaveLength(1)
    const nc = store.network_contacts[0]!
    expect(nc.owner_id).toBe(INVITER)
    expect(nc.source).toBe('event')
    expect(nc.visibility).toBe('private')
    expect(nc.email).toBe('sam@example.com')
    expect(nc.phone).toBe('555-1234')
    expect(nc.avatar_path).toBeUndefined() // no photo → the PRIVATE bucket is untouched

    expect(store.contacts).toHaveLength(1)
    const c = store.contacts[0]!
    expect(c.consent_state).toBe('unknown') // ADDED, never mailed
    expect(c.source).toBe('event')
    expect(nc.linked_contact_id).toBe(c.id) // personal card linked back to the marketing row

    expect(res).toMatchObject({ guestId: g.id, networkContactId: nc.id, contactId: c.id })
  })

  it('rejects a malformed email with no writes anywhere', async () => {
    const res = await captureEventGuest({ ...base, email: 'not-an-email' })
    expect(res).toEqual({ ok: false, guestId: null, networkContactId: null, contactId: null })
    expect(store.event_guests).toHaveLength(0)
    expect(store.network_contacts).toHaveLength(0)
    expect(store.contacts).toHaveLength(0)
  })
})

describe('captureEventGuest — personal dedupe', () => {
  it('refreshes an existing card for the same owner+email instead of duplicating', async () => {
    store.network_contacts.push({ id: 'nc-existing', owner_id: INVITER, email: 'sam@example.com', source: 'manual' })
    const res = await captureEventGuest({ ...base, phone: '555-9999' })
    expect(store.network_contacts).toHaveLength(1) // no duplicate
    expect(res.networkContactId).toBe('nc-existing')
    expect(store.network_contacts[0]!.phone).toBe('555-9999') // refreshed
    expect(store.network_contacts[0]!.source).toBe('manual') // its own source is not clobbered
  })
})

describe('captureEventGuest — marketing no-downgrade', () => {
  it('touches but never downgrades an existing subscribed member/lead', async () => {
    store.contacts.push({
      id: 'c-existing',
      space_id: 'root-space',
      email: 'sam@example.com',
      consent_state: 'subscribed',
      source: 'member',
    })
    await captureEventGuest({ ...base })
    expect(store.contacts).toHaveLength(1)
    expect(store.contacts[0]!.consent_state).toBe('subscribed') // untouched
    expect(store.contacts[0]!.source).toBe('member') // untouched
  })
})

describe('captureEventGuest — failure isolation', () => {
  it('still writes the personal card when the guest-list leg throws', async () => {
    store.fail.event_guests_insert = true
    const res = await captureEventGuest({ ...base })
    expect(res.guestId).toBeNull()
    expect(res.ok).toBe(false) // a priority leg failed
    expect(store.network_contacts).toHaveLength(1) // personal leg is isolated
    expect(res.networkContactId).not.toBeNull()
  })

  it('keeps the capture ok when only the best-effort marketing leg fails', async () => {
    store.fail.contacts_insert = true
    const res = await captureEventGuest({ ...base })
    expect(res.contactId).toBeNull()
    expect(res.ok).toBe(true) // priority legs (guest + personal) landed
    expect(store.event_guests).toHaveLength(1)
    expect(store.network_contacts).toHaveLength(1)
  })
})
