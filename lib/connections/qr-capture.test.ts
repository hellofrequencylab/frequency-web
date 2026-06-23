import { describe, it, expect, beforeEach, vi } from 'vitest'

// IN-PERSON QR CAPTURE (CRM-STRATEGY §4, ADR-361, P2). What is locked here, all
// network-free (the supabase admin client + the note/touch store seam are mocked):
//   1. SKIP SELF: scanning your own code captures nothing and returns null.
//   2. DEDUPE: a second scan of a member you already have does NOT create a row —
//      it refreshes met-context + last_contacted_at on the existing contact and
//      returns that id.
//   3. CREATE: a first scan creates a private qr_scan contact, pre-filled from the
//      owner's PUBLIC profile, with met-context stamped + a "Met via QR" note.
//   4. FAIL-SAFE: an insert error returns null (the scan/redirect never breaks).

// ── In-memory network_contacts + profiles, behind a chainable admin mock ─────────
type ContactRow = {
  id: string
  owner_id: string
  source: string
  visibility: string
  linked_profile_id: string | null
  display_name: string | null
  title: string | null
  avatar_path: string | null
  details: Record<string, unknown>
  last_contacted_at: string | null
  created_at: string
  updated_at?: string
}

const db = {
  contacts: [] as ContactRow[],
  profiles: [] as { id: string; display_name: string | null; vcard: unknown }[],
  failNextInsert: false,
  nextId: 1,
}

// network_contacts builder: select(...).eq('owner_id').eq('linked_profile_id')
//   .order(...).limit(...).maybeSingle()  (dedupe read)
// insert({...}).select('id').maybeSingle()  (create)
// update({...}).eq('id').eq('owner_id')  (refresh)
function contactsBuilder() {
  const filters: Record<string, string> = {}
  let pendingInsert: Record<string, unknown> | null = null
  let pendingUpdate: Record<string, unknown> | null = null
  const api = {
    select() {
      return api
    },
    eq(col: string, val: string) {
      filters[col] = val
      // update path: update(...).eq('id').eq('owner_id') resolves on the 2nd eq.
      if (pendingUpdate && col === 'owner_id') {
        const row = db.contacts.find((r) => r.id === filters.id && r.owner_id === val)
        if (row) Object.assign(row, pendingUpdate)
        pendingUpdate = null
        return Promise.resolve({ error: null })
      }
      return api
    },
    order() {
      return api
    },
    limit() {
      return api
    },
    async maybeSingle() {
      if (pendingInsert) {
        if (db.failNextInsert) {
          db.failNextInsert = false
          pendingInsert = null
          return { data: null, error: { message: 'insert failed' } }
        }
        const row = {
          id: `c${db.nextId++}`,
          created_at: '2026-06-23T00:00:00.000Z',
          ...(pendingInsert as object),
        } as ContactRow
        db.contacts.push(row)
        pendingInsert = null
        return { data: { id: row.id }, error: null }
      }
      let rows = db.contacts
      if (filters.owner_id) rows = rows.filter((r) => r.owner_id === filters.owner_id)
      if (filters.linked_profile_id)
        rows = rows.filter((r) => r.linked_profile_id === filters.linked_profile_id)
      return { data: rows[0] ?? null, error: null }
    },
    insert(row: Record<string, unknown>) {
      pendingInsert = row
      return api
    },
    update(patch: Record<string, unknown>) {
      pendingUpdate = patch
      return api
    },
  }
  return api
}

function profilesBuilder() {
  const filters: Record<string, string> = {}
  return {
    select() {
      return this
    },
    eq(col: string, val: string) {
      filters[col] = val
      return this
    },
    async maybeSingle() {
      const row = db.profiles.find((p) => p.id === filters.id)
      return { data: row ?? null, error: null }
    },
  }
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'network_contacts') return contactsBuilder()
      if (table === 'profiles') return profilesBuilder()
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

// The note + touch seam — assert they fire without exercising the real store.
const addNote = vi.fn<(...a: unknown[]) => Promise<boolean>>(() => Promise.resolve(true))
const touchLastContacted = vi.fn<(...a: unknown[]) => Promise<void>>(() => Promise.resolve())
vi.mock('./store', () => ({
  addNote: (...a: unknown[]) => addNote(...a),
  touchLastContacted: (...a: unknown[]) => touchLastContacted(...a),
}))

import { captureQrContact } from './qr-capture'

const SCANNER = 'scanner-0000-4000-a000-00000000scnr'
const OWNER = 'owner-00000-4000-a000-00000000ownr'

beforeEach(() => {
  db.contacts = []
  db.profiles = [
    { id: OWNER, display_name: 'Ada Owner', vcard: { enabled: true, title: 'Yoga teacher' } },
  ]
  db.failNextInsert = false
  db.nextId = 1
  addNote.mockClear()
  touchLastContacted.mockClear()
})

describe('captureQrContact — skip self', () => {
  it('returns null and captures nothing when scanning your own code', async () => {
    expect(await captureQrContact(OWNER, OWNER, { at: 'Beach Cleanup' })).toBeNull()
    expect(db.contacts).toHaveLength(0)
    expect(addNote).not.toHaveBeenCalled()
  })

  it('returns null on a missing scanner or owner id', async () => {
    expect(await captureQrContact('', OWNER)).toBeNull()
    expect(await captureQrContact(SCANNER, '')).toBeNull()
    expect(db.contacts).toHaveLength(0)
  })
})

describe('captureQrContact — create (first scan)', () => {
  it('creates a private qr_scan contact pre-filled from the public profile', async () => {
    const id = await captureQrContact(SCANNER, OWNER, { at: 'Beach Cleanup', on: '2026-06-23' })
    expect(id).toBe('c1')
    expect(db.contacts).toHaveLength(1)
    const row = db.contacts[0]!
    expect(row.owner_id).toBe(SCANNER)
    expect(row.source).toBe('qr_scan')
    expect(row.visibility).toBe('private')
    expect(row.linked_profile_id).toBe(OWNER)
    expect(row.display_name).toBe('Ada Owner')
    expect(row.title).toBe('Yoga teacher') // opted-in vCard title
    expect(row.avatar_path).toBeNull() // never copy the profile photo
    expect(row.details.metContext).toEqual({ via: 'qr', at: 'Beach Cleanup', on: '2026-06-23' })
    expect(row.last_contacted_at).not.toBeNull()
  })

  it('stamps a "Met via QR" connection note via the existing note path', async () => {
    await captureQrContact(SCANNER, OWNER, { at: 'Beach Cleanup' })
    expect(addNote).toHaveBeenCalledTimes(1)
    const [owner, , body, kind] = addNote.mock.calls[0] as unknown[]
    expect(owner).toBe(SCANNER)
    expect(body).toBe('Met via QR at Beach Cleanup.')
    expect(kind).toBe('connection')
  })

  it('defaults the met date to today and writes a plain note with no place', async () => {
    const id = await captureQrContact(SCANNER, OWNER)
    expect(id).toBe('c1')
    const met = db.contacts[0]!.details.metContext as { at: string | null; on: string | null }
    expect(met.at).toBeNull()
    expect(met.on).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const [, , body] = addNote.mock.calls[0] as unknown[]
    expect(body).toBe('Met via QR.')
  })
})

describe('captureQrContact — dedupe (re-scan)', () => {
  it('does NOT create a duplicate; refreshes met-context + last_contacted and returns the same id', async () => {
    const first = await captureQrContact(SCANNER, OWNER, { at: 'Beach Cleanup' })
    expect(first).toBe('c1')
    expect(db.contacts).toHaveLength(1)
    addNote.mockClear()

    const second = await captureQrContact(SCANNER, OWNER, { at: 'Sunday Market', on: '2026-07-01' })
    expect(second).toBe('c1') // same row
    expect(db.contacts).toHaveLength(1) // no duplicate
    expect(db.contacts[0]!.details.metContext).toEqual({
      via: 'qr',
      at: 'Sunday Market',
      on: '2026-07-01',
    })
    expect(touchLastContacted).toHaveBeenCalledWith(SCANNER, 'c1')
    // A re-scan does not add another note.
    expect(addNote).not.toHaveBeenCalled()
  })
})

describe('captureQrContact — fail-safe', () => {
  it('returns null when the insert errors (the scan/redirect never breaks)', async () => {
    db.failNextInsert = true
    expect(await captureQrContact(SCANNER, OWNER, { at: 'Beach Cleanup' })).toBeNull()
    expect(db.contacts).toHaveLength(0)
    expect(addNote).not.toHaveBeenCalled()
  })
})
