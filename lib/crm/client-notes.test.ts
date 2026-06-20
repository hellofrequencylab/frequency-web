import { describe, it, expect, beforeEach, vi } from 'vitest'

// CLIENT NOTES (ENTITY-SPACES-BUILD §C Phase 2). What is locked here, all network-free (the supabase
// admin client + auth + store + capability seam are mocked):
//   1. PURE body normalization is fail-closed: non-strings collapse to '', whitespace trims, length
//      caps, an empty body is rejected by the write.
//   2. PERMISSION GATING: list / add / delete all require canEditProfile (anonymous + non-editor are
//      rejected; reads return [], writes write nothing and return an error).
//   3. CROSS-SPACE ISOLATION (the personal-data guarantee): a Space A owner can never read or write
//      Space B's notes. listClientNotes for Space A returns ONLY Space A rows; a contact that is not
//      in Space A is treated as absent (its notes are never read); a delete is scoped by (id AND
//      space_id) so a cross-space note id is a no-op.

// ── Mock the caller identity + Space resolver + capability seam (toggled per test) ──────────────
let currentProfileId: string | null = 'ownerA-00-4000-a000-00000000ownr'
vi.mock('@/lib/auth', () => ({
  getMyProfileId: async () => currentProfileId,
}))

// Two Spaces with two distinct owners. getSpaceById returns whichever id is asked for.
const SPACES: Record<string, { id: string; ownerProfileId: string }> = {
  'space-A': { id: 'space-A', ownerProfileId: 'ownerA-00-4000-a000-00000000ownr' },
  'space-B': { id: 'space-B', ownerProfileId: 'ownerB-00-4000-a000-00000000ownr' },
}
vi.mock('@/lib/spaces/store', () => ({
  getSpaceById: async (id: string) => SPACES[id] ?? null,
}))

// canEditProfile is granted only when the caller is the OWNER of the resolved Space (so an owner of
// Space A is NOT an editor of Space B). Mirrors getSpaceCapabilities' owner rule, isolated per test.
vi.mock('@/lib/spaces/entitlements', () => ({
  getSpaceCapabilities: async (
    space: { ownerProfileId?: string | null } | null | undefined,
    profileId: string | null | undefined,
  ) => {
    const isOwner = !!space?.ownerProfileId && !!profileId && space.ownerProfileId === profileId
    return {
      isOwner,
      isAdmin: isOwner,
      role: isOwner ? 'admin' : null,
      canEditProfile: isOwner,
      canManageMembers: isOwner,
      canInvite: isOwner,
    }
  },
}))

// ── A chainable admin-client mock backed by in-memory contacts + notes ──────────────────────────
type ContactRow = {
  id: string
  space_id: string
  email: string
  display_name: string | null
  consent_state: string
  created_at: string | null
}
type NoteRow = {
  id: string
  space_id: string
  contact_id: string | null
  author_profile_id: string | null
  body: string
  created_at: string
}

const db = {
  contacts: [] as ContactRow[],
  notes: [] as NoteRow[],
  inserts: [] as Record<string, unknown>[],
  deletes: [] as { id: string; space_id: string }[],
  failNextInsert: false,
}

// contacts builder: select(...).eq('id', ...).eq('space_id', ...).maybeSingle() — getContact's shape.
function contactsBuilder() {
  const filters: { id?: string; space_id?: string } = {}
  const api = {
    select() {
      return api
    },
    eq(col: string, val: string) {
      if (col === 'id') filters.id = val
      if (col === 'space_id') filters.space_id = val
      return api
    },
    order() {
      return api
    },
    limit() {
      return api
    },
    async maybeSingle() {
      let rows = db.contacts
      if (filters.id) rows = rows.filter((r) => r.id === filters.id)
      if (filters.space_id) rows = rows.filter((r) => r.space_id === filters.space_id)
      return { data: rows[0] ?? null, error: null }
    },
    then(resolve: (r: { data: ContactRow[] | null; error: null }) => unknown) {
      let rows = db.contacts
      if (filters.space_id) rows = rows.filter((r) => r.space_id === filters.space_id)
      return Promise.resolve(resolve({ data: rows, error: null }))
    },
  }
  return api
}

// notes builder: select(...).eq('space_id').eq('contact_id').order(...) for reads;
// insert([...]).select(...).maybeSingle() for writes; delete().eq('id').eq('space_id') for deletes.
function notesBuilder() {
  const filters: { space_id?: string; contact_id?: string } = {}
  let pendingInsert: Record<string, unknown> | null = null
  const api = {
    select() {
      return api
    },
    eq(col: string, val: string) {
      if (col === 'space_id') filters.space_id = val
      if (col === 'contact_id') filters.contact_id = val
      return api
    },
    order() {
      let rows = db.notes
      if (filters.space_id) rows = rows.filter((r) => r.space_id === filters.space_id)
      if (filters.contact_id) rows = rows.filter((r) => r.contact_id === filters.contact_id)
      rows = [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      return Promise.resolve({ data: rows, error: null })
    },
    insert(rows: Record<string, unknown>[]) {
      pendingInsert = rows[0] ?? null
      return api
    },
    async maybeSingle() {
      if (pendingInsert) {
        if (db.failNextInsert) {
          db.failNextInsert = false
          return { data: null, error: { message: 'insert failed' } }
        }
        const row = {
          id: `n${db.notes.length}`,
          created_at: '2026-06-20T00:00:00.000Z',
          ...(pendingInsert as object),
        } as NoteRow
        db.notes.push(row)
        db.inserts.push(pendingInsert)
        return { data: row, error: null }
      }
      return { data: null, error: null }
    },
    delete() {
      const del: { id?: string; space_id?: string } = {}
      const delApi = {
        eq(col: string, val: string) {
          if (col === 'id') del.id = val
          if (col === 'space_id') del.space_id = val
          // The second eq (space_id) is the terminal write.
          if (del.id && del.space_id) {
            db.deletes.push({ id: del.id, space_id: del.space_id })
            db.notes = db.notes.filter(
              (n) => !(n.id === del.id && n.space_id === del.space_id),
            )
            return Promise.resolve({ error: null })
          }
          return delApi
        },
      }
      return delApi
    },
  }
  return api
}

function profilesBuilder() {
  return {
    select() {
      return {
        async in(_col: string, ids: string[]) {
          return {
            data: [{ id: ids[0]!, display_name: 'Owner A' }].filter((p) => ids.includes(p.id)),
          }
        },
      }
    },
  }
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'contacts') return contactsBuilder()
      if (table === 'client_notes') return notesBuilder()
      if (table === 'profiles') return profilesBuilder()
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import {
  normalizeNoteBody,
  listClientNotes,
  addClientNote,
  deleteClientNote,
} from './client-notes'

beforeEach(() => {
  currentProfileId = 'ownerA-00-4000-a000-00000000ownr'
  db.contacts = [
    {
      id: 'contact-A',
      space_id: 'space-A',
      email: 'a@example.com',
      display_name: 'Ada in A',
      consent_state: 'unknown',
      created_at: '2026-06-01T00:00:00.000Z',
    },
    {
      id: 'contact-B',
      space_id: 'space-B',
      email: 'b@example.com',
      display_name: 'Boris in B',
      consent_state: 'unknown',
      created_at: '2026-06-02T00:00:00.000Z',
    },
  ]
  db.notes = []
  db.inserts = []
  db.deletes = []
  db.failNextInsert = false
})

describe('normalizeNoteBody (pure, fail-closed)', () => {
  it('trims and length-caps a string', () => {
    expect(normalizeNoteBody('  hello ')).toBe('hello')
    expect(normalizeNoteBody('x'.repeat(5000)).length).toBe(4000)
  })
  it('returns "" for a non-string (rejected by the write)', () => {
    expect(normalizeNoteBody(42)).toBe('')
    expect(normalizeNoteBody(null)).toBe('')
    expect(normalizeNoteBody('   ')).toBe('')
  })
})

describe('addClientNote (action) — gating + scope', () => {
  it('rejects an anonymous caller and writes nothing', async () => {
    currentProfileId = null
    const r = await addClientNote('space-A', 'contact-A', 'hi')
    expect('error' in r).toBe(true)
    expect(db.inserts).toHaveLength(0)
  })

  it('rejects a non-editor (an owner of a different space) and writes nothing', async () => {
    currentProfileId = 'ownerB-00-4000-a000-00000000ownr' // owner of B, not A
    const r = await addClientNote('space-A', 'contact-A', 'hi')
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/permission/i)
    expect(db.inserts).toHaveLength(0)
  })

  it('rejects an empty body', async () => {
    const r = await addClientNote('space-A', 'contact-A', '   ')
    expect('error' in r).toBe(true)
    expect(db.inserts).toHaveLength(0)
  })

  it('rejects a contact that is not in this space (no cross-space attach)', async () => {
    // Owner A tries to attach a note to contact-B (which belongs to Space B).
    const r = await addClientNote('space-A', 'contact-B', 'hi')
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/not in this space/i)
    expect(db.inserts).toHaveLength(0)
  })

  it('the space owner adds a note (stamped with space_id + author)', async () => {
    const r = await addClientNote('space-A', 'contact-A', '  Loves the morning class  ')
    expect('error' in r).toBe(false)
    expect(db.inserts).toHaveLength(1)
    expect(db.inserts[0]!.space_id).toBe('space-A')
    expect(db.inserts[0]!.contact_id).toBe('contact-A')
    expect(db.inserts[0]!.author_profile_id).toBe('ownerA-00-4000-a000-00000000ownr')
    expect(db.inserts[0]!.body).toBe('Loves the morning class') // trimmed
  })
})

describe('listClientNotes (action) — owner-only, space-scoped', () => {
  beforeEach(() => {
    db.notes = [
      {
        id: 'nA',
        space_id: 'space-A',
        contact_id: 'contact-A',
        author_profile_id: 'ownerA-00-4000-a000-00000000ownr',
        body: 'A note',
        created_at: '2026-06-10T00:00:00.000Z',
      },
      {
        id: 'nB',
        space_id: 'space-B',
        contact_id: 'contact-B',
        author_profile_id: 'ownerB-00-4000-a000-00000000ownr',
        body: 'B note',
        created_at: '2026-06-11T00:00:00.000Z',
      },
    ]
  })

  it('returns [] for an anonymous caller', async () => {
    currentProfileId = null
    expect(await listClientNotes('space-A', 'contact-A')).toEqual([])
  })

  it('returns [] for a non-editor (owner of another space)', async () => {
    currentProfileId = 'ownerB-00-4000-a000-00000000ownr'
    expect(await listClientNotes('space-A', 'contact-A')).toEqual([])
  })

  it('the owner reads ONLY their own space notes (cross-space isolation)', async () => {
    const list = await listClientNotes('space-A', 'contact-A')
    expect(list).toHaveLength(1)
    expect(list[0]!.id).toBe('nA')
    expect(list[0]!.body).toBe('A note')
  })

  it('Space A owner cannot read Space B notes even via Space B (not an editor there)', async () => {
    // currentProfileId is owner A; asking for space-B is a non-editor request -> [].
    expect(await listClientNotes('space-B', 'contact-B')).toEqual([])
  })

  it('returns [] when the contact is not in the space', async () => {
    // Owner A asks for contact-B (a Space B contact) under Space A -> the contact is absent.
    expect(await listClientNotes('space-A', 'contact-B')).toEqual([])
  })
})

describe('deleteClientNote (action) — gating + space-scoped delete', () => {
  beforeEach(() => {
    db.notes = [
      {
        id: 'nA',
        space_id: 'space-A',
        contact_id: 'contact-A',
        author_profile_id: 'ownerA-00-4000-a000-00000000ownr',
        body: 'A note',
        created_at: '2026-06-10T00:00:00.000Z',
      },
    ]
  })

  it('rejects a non-editor and deletes nothing', async () => {
    currentProfileId = 'ownerB-00-4000-a000-00000000ownr'
    const r = await deleteClientNote('space-A', 'nA')
    expect('error' in r).toBe(true)
    expect(db.notes).toHaveLength(1)
  })

  it('the owner deletes their own space note (scoped by id AND space_id)', async () => {
    const r = await deleteClientNote('space-A', 'nA')
    expect('error' in r).toBe(false)
    expect(db.deletes).toEqual([{ id: 'nA', space_id: 'space-A' }])
    expect(db.notes).toHaveLength(0)
  })

  it('a cross-space note id is a no-op (delete filtered by space_id)', async () => {
    // Owner B (editor of B) tries to delete Space A's note id via Space B: scoped delete removes
    // nothing because nA.space_id !== 'space-B'.
    currentProfileId = 'ownerB-00-4000-a000-00000000ownr'
    const r = await deleteClientNote('space-B', 'nA')
    expect('error' in r).toBe(false) // the delete ran, but matched no row
    expect(db.notes).toHaveLength(1) // Space A's note is untouched
  })
})
