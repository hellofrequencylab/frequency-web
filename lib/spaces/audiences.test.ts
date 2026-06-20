import { describe, it, expect, beforeEach, vi } from 'vitest'

// PER-SPACE AUDIENCES (ENTITY-SPACES-BUILD §C Phase 3). What is locked here, all network-free (the
// supabase admin client is mocked over an in-memory store):
//   1. resolveAudience reads ONLY the active Space's contacts (space_id filter) — never another
//      Space's, even with the same tag. Returns the EXACT send-seam shape { contactId, email }[].
//   2. The tag filter narrows to contacts linked (network_contacts.linked_contact_id) to a tagged
//      network_contact IN THIS SPACE. A contact with no link never matches a tag. Tag match is
//      case-insensitive.
//   3. NO CROSS-SPACE LEAK: a tag that exists in Space B never pulls Space A's contacts, and a
//      Space B contact is never returned for a Space A resolve.
//   4. De-dupe by lowercased email; junk emails dropped; fail-safe to [] on error.

// ── A chainable admin-client mock backed by an in-memory store ──────────────────────────────────
type ContactRow = { id: string; email: string | null; space_id: string }
// network_contact_tags joined to its parent network_contact (PostgREST embed shape).
type TagRow = {
  tag: string
  network_contacts: { space_id: string; linked_contact_id: string | null }
}

const db = {
  contacts: [] as ContactRow[],
  tags: [] as TagRow[],
}

// contacts builder: .select(cols).eq('space_id', v).limit(n) -> { data, error }
function contactsBuilder() {
  const filters: { space_id?: string } = {}
  const api = {
    select() {
      return api
    },
    eq(col: string, val: string) {
      if (col === 'space_id') filters.space_id = val
      return api
    },
    async limit(n: number) {
      const data = db.contacts
        .filter((c) => c.space_id === filters.space_id)
        .slice(0, n)
      return { data: data.map((c) => ({ id: c.id, email: c.email })), error: null }
    },
  }
  return api
}

// network_contact_tags builder. Two shapes are used:
//   resolveAudience tag path: .select(embed).eq('network_contacts.space_id', v).ilike('tag', t)
//   listAudienceTags path:    .select(embed).eq('network_contacts.space_id', v)
//                                          .not('network_contacts.linked_contact_id', 'is', null)
function tagsBuilder() {
  const filters: { space_id?: string; tag?: string; requireLink?: boolean } = {}
  function rows() {
    let data = db.tags.filter((t) => t.network_contacts.space_id === filters.space_id)
    if (filters.tag) data = data.filter((t) => t.tag.toLowerCase() === filters.tag!.toLowerCase())
    if (filters.requireLink) data = data.filter((t) => t.network_contacts.linked_contact_id != null)
    return data
  }
  const api = {
    select() {
      return api
    },
    eq(col: string, val: string) {
      if (col === 'network_contacts.space_id') filters.space_id = val
      return api
    },
    async ilike(_col: string, val: string) {
      filters.tag = val
      return { data: rows(), error: null }
    },
    async not(col: string, op: string, val: null) {
      // Mirror the real call: .not('network_contacts.linked_contact_id', 'is', null).
      if (col === 'network_contacts.linked_contact_id' && op === 'is' && val === null)
        filters.requireLink = true
      return { data: rows(), error: null }
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'contacts') return contactsBuilder()
      if (table === 'network_contact_tags') return tagsBuilder()
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import { resolveAudience, audienceCount, listAudienceTags, normalizeTag } from './audiences'

beforeEach(() => {
  db.contacts = []
  db.tags = []
})

function seedContact(id: string, email: string | null, spaceId = 'space-A') {
  db.contacts.push({ id, email, space_id: spaceId })
}
function seedTag(tag: string, linkedContactId: string | null, spaceId = 'space-A') {
  db.tags.push({ tag, network_contacts: { space_id: spaceId, linked_contact_id: linkedContactId } })
}

describe('normalizeTag (pure)', () => {
  it('trims, and reads blank / non-string as no filter (null)', () => {
    expect(normalizeTag('  vip ')).toBe('vip')
    expect(normalizeTag('   ')).toBeNull()
    expect(normalizeTag('')).toBeNull()
    expect(normalizeTag(42)).toBeNull()
    expect(normalizeTag(undefined)).toBeNull()
  })
})

describe('resolveAudience — all contacts (no tag)', () => {
  it("returns this Space's contacts in the send-seam shape { contactId, email }", async () => {
    seedContact('c1', 'a@x.com')
    seedContact('c2', 'b@x.com')
    const out = await resolveAudience('space-A')
    expect(out).toEqual([
      { contactId: 'c1', email: 'a@x.com' },
      { contactId: 'c2', email: 'b@x.com' },
    ])
  })

  it('drops contacts with a missing / malformed email', async () => {
    seedContact('c1', 'a@x.com')
    seedContact('c2', null)
    seedContact('c3', 'not-an-email')
    const out = await resolveAudience('space-A')
    expect(out.map((r) => r.contactId)).toEqual(['c1'])
  })

  it('de-dupes by lowercased email (first wins)', async () => {
    seedContact('c1', 'Dup@X.com')
    seedContact('c2', 'dup@x.com')
    const out = await resolveAudience('space-A')
    expect(out).toHaveLength(1)
    expect(out[0]!.contactId).toBe('c1')
  })

  it('returns [] for an empty Space and for a blank spaceId', async () => {
    expect(await resolveAudience('space-A')).toEqual([])
    expect(await resolveAudience('')).toEqual([])
  })
})

describe('resolveAudience — tag filter', () => {
  beforeEach(() => {
    seedContact('c1', 'a@x.com')
    seedContact('c2', 'b@x.com')
    seedContact('c3', 'c@x.com')
  })

  it('narrows to contacts linked to a tagged network_contact in this Space', async () => {
    seedTag('vip', 'c1')
    seedTag('vip', 'c3')
    const out = await resolveAudience('space-A', { tag: 'vip' })
    expect(out.map((r) => r.contactId).sort()).toEqual(['c1', 'c3'])
  })

  it('matches the tag case-insensitively', async () => {
    seedTag('VIP', 'c2')
    const out = await resolveAudience('space-A', { tag: 'vip' })
    expect(out.map((r) => r.contactId)).toEqual(['c2'])
  })

  it('a tag with no linked contacts resolves to nobody', async () => {
    seedTag('vip', null) // tagged network_contact not promoted to a marketing contact
    const out = await resolveAudience('space-A', { tag: 'vip' })
    expect(out).toEqual([])
  })

  it('a blank tag reads as "all contacts", not "nobody"', async () => {
    const out = await resolveAudience('space-A', { tag: '   ' })
    expect(out).toHaveLength(3)
  })
})

describe('resolveAudience — cross-space isolation (no leak)', () => {
  it("never returns another Space's contacts (all-contacts path)", async () => {
    seedContact('a1', 'a@x.com', 'space-A')
    seedContact('b1', 'b@x.com', 'space-B')
    const out = await resolveAudience('space-A')
    expect(out.map((r) => r.contactId)).toEqual(['a1'])
  })

  it("a tag in Space B never pulls Space A's contacts, and vice versa", async () => {
    seedContact('a1', 'a@x.com', 'space-A')
    seedContact('b1', 'b@x.com', 'space-B')
    // Same tag name in both spaces, each linked to its own space's contact.
    seedTag('vip', 'a1', 'space-A')
    seedTag('vip', 'b1', 'space-B')

    const aOut = await resolveAudience('space-A', { tag: 'vip' })
    expect(aOut.map((r) => r.contactId)).toEqual(['a1'])

    const bOut = await resolveAudience('space-B', { tag: 'vip' })
    expect(bOut.map((r) => r.contactId)).toEqual(['b1'])
  })

  it("a Space A tag linked (impossibly) to a Space B contact id still cannot leak it (contact not in A)", async () => {
    seedContact('a1', 'a@x.com', 'space-A')
    seedContact('b1', 'b@x.com', 'space-B')
    // A Space-A network_contact tag whose linked_contact_id points at a Space-B contact id.
    seedTag('vip', 'b1', 'space-A')
    const out = await resolveAudience('space-A', { tag: 'vip' })
    // b1 is not among Space A's contacts, so the intersection is empty — no leak.
    expect(out).toEqual([])
  })
})

describe('audienceCount', () => {
  it('counts the resolved recipients (and agrees with resolveAudience)', async () => {
    seedContact('c1', 'a@x.com')
    seedContact('c2', 'b@x.com')
    expect(await audienceCount('space-A')).toBe(2)
    seedTag('vip', 'c1')
    expect(await audienceCount('space-A', { tag: 'vip' })).toBe(1)
  })
})

describe('listAudienceTags', () => {
  it('returns distinct, sorted tags for linked contacts in this Space only', async () => {
    seedTag('vip', 'c1', 'space-A')
    seedTag('VIP', 'c2', 'space-A') // same tag, different case -> de-duped
    seedTag('lead', 'c3', 'space-A')
    seedTag('orphan', null, 'space-A') // not linked -> excluded
    seedTag('other', 'b1', 'space-B') // other space -> excluded
    const tags = await listAudienceTags('space-A')
    expect(tags).toEqual(['lead', 'vip'])
  })

  it('returns [] for a blank spaceId', async () => {
    expect(await listAudienceTags('')).toEqual([])
  })
})
