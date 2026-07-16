import { describe, it, expect, beforeEach, vi } from 'vitest'

// SPACE INVITES (ENTITY-SPACES-SYSTEM §3.2, the team layer). What is locked here, all network-free
// (the supabase admin client + auth + store + capability + membership-seat seams are mocked):
//   1. PURE helpers are fail-closed: email normalization rejects junk + lower-cases; role defaults to
//      'editor'; tokens are unique + non-empty; expiry treats a missing / unparseable value as
//      EXPIRED.
//   2. PERMISSION GATING on the actions: createInvite / listInvites / revokeInvite require
//      canManageMembers (owner / admin). An anonymous or non-manager caller is rejected (nothing is
//      written / [] is returned).
//   3. ACCEPT seats the invitee: a pending, not-expired token seats them via addSpaceMember at the
//      invite's role and marks the invite accepted. An unknown / expired / already-used token, or an
//      anonymous caller, seats no one (fail-closed).

// ── Mock the caller identity + Space resolver + capability seam (toggled per test) ──────────────
let currentProfileId: string | null = 'owner-0000-4000-a000-0000000ownr'
vi.mock('@/lib/auth', () => ({
  getMyProfileId: async () => currentProfileId,
}))

let resolvedSpace: {
  id: string
  slug: string
  ownerProfileId?: string | null
  name?: string
  brandName?: string | null
} | null = {
  id: 'space-1',
  slug: 'river-studio',
  ownerProfileId: 'owner-0000-4000-a000-0000000ownr',
  name: 'River Studio',
  brandName: null,
}
vi.mock('./store', () => ({
  getSpaceById: async () => resolvedSpace,
}))

// Email sender seam — createInvite enqueues the shared invite email with the accept link. The
// outbox itself is exercised elsewhere; here we only prove createInvite hands sendInviteEmail the
// right invite (recipient, Space context, join link) and that a mail hiccup never fails the invite.
const { sendInviteEmail } = vi.hoisted(() => ({
  sendInviteEmail: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
}))
vi.mock('@/lib/email', () => ({ sendInviteEmail }))

let canManageMembers = true
vi.mock('./entitlements', () => ({
  getSpaceCapabilities: async () => ({
    isOwner: canManageMembers,
    isAdmin: canManageMembers,
    role: canManageMembers ? 'admin' : null,
    canEditProfile: canManageMembers,
    canManageMembers,
    canInvite: canManageMembers,
  }),
}))

// addSpaceMember is the seat seam (spied so we can assert the invitee is seated at the invite's role
// + active). isSpaceRole stays REAL so the row-mapper's fail-closed behaviour is exercised. The spy is
// created via vi.hoisted so the (hoisted) vi.mock factory can close over it.
const { addSpaceMember } = vi.hoisted(() => ({
  addSpaceMember: vi.fn<(...args: unknown[]) => Promise<{ id: string } | null>>(async () => ({
    id: 'm1',
  })),
}))
vi.mock('./membership', async () => {
  const actual = await vi.importActual<typeof import('./membership')>('./membership')
  return { ...actual, addSpaceMember }
})

// ── A chainable admin-client mock backed by an in-memory invites store ──────────────────────────
type InviteRow = {
  id: string
  space_id: string
  email: string
  role: string
  token: string
  status: string
  invited_by: string | null
  expires_at: string
  created_at: string
}
const db = {
  invites: [] as InviteRow[],
  updates: [] as { id: string; patch: Record<string, unknown> }[],
}

function invitesBuilder() {
  const filters: { space_id?: string; status?: string; id?: string; email?: string; token?: string } =
    {}
  let pendingInsert: Record<string, unknown> | null = null
  let pendingUpdate: Record<string, unknown> | null = null
  const api = {
    select() {
      return api
    },
    eq(col: string, val: string) {
      ;(filters as Record<string, string>)[col] = val
      return api
    },
    order() {
      return api
    },
    insert(rows: Record<string, unknown>[]) {
      pendingInsert = rows[0] ?? null
      return api
    },
    update(patch: Record<string, unknown>) {
      pendingUpdate = patch
      return api
    },
    async maybeSingle() {
      // After an insert: append the new row and return it.
      if (pendingInsert) {
        const row = pendingInsert
        pendingInsert = null
        const stored: InviteRow = {
          id: `inv${db.invites.length}`,
          space_id: String(row.space_id),
          email: String(row.email),
          role: String(row.role),
          token: String(row.token),
          status: String(row.status),
          invited_by: (row.invited_by as string | null) ?? null,
          expires_at: String(row.expires_at),
          created_at: new Date().toISOString(),
        }
        db.invites.push(stored)
        return { data: stored, error: null }
      }
      // After an update with .eq('id', …).select().maybeSingle(): patch the row, then return it.
      if (pendingUpdate) {
        const patch = pendingUpdate
        pendingUpdate = null
        const target = db.invites.find((r) => r.id === filters.id)
        if (target) {
          Object.assign(target, patch)
          db.updates.push({ id: target.id, patch })
          return { data: target, error: null }
        }
        return { data: null, error: null }
      }
      // A plain read by id / token / email+status (the live-invite check).
      const found =
        db.invites.find(
          (r) =>
            (filters.id == null || r.id === filters.id) &&
            (filters.token == null || r.token === filters.token) &&
            (filters.email == null || r.email === filters.email) &&
            (filters.space_id == null || r.space_id === filters.space_id) &&
            (filters.status == null || r.status === filters.status),
        ) ?? null
      return { data: found, error: null }
    },
    then(resolve: (r: { data: InviteRow[] | null; error: null }) => unknown) {
      // An update awaited WITHOUT a trailing maybeSingle (revoke / accept-marking) resolves here.
      if (pendingUpdate) {
        const patch = pendingUpdate
        pendingUpdate = null
        const target = db.invites.find((r) => r.id === filters.id)
        if (target) {
          Object.assign(target, patch)
          db.updates.push({ id: target.id, patch })
        }
        return Promise.resolve(resolve({ data: null, error: null }))
      }
      let data = db.invites.filter(
        (r) =>
          (filters.space_id == null || r.space_id === filters.space_id) &&
          (filters.status == null || r.status === filters.status),
      )
      data = [...data].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      return Promise.resolve(resolve({ data, error: null }))
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => invitesBuilder() }),
}))

import {
  normalizeEmail,
  normalizeInviteRole,
  generateInviteToken,
  inviteAcceptUrl,
  isExpired,
  isInviteStatus,
  createInvite,
  listInvites,
  revokeInvite,
  acceptInvite,
} from './invites'
import { isError } from '@/lib/action-result'

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
const PAST = new Date(Date.now() - 1000).toISOString()

function seedInvite(partial: Partial<InviteRow> = {}): InviteRow {
  const row: InviteRow = {
    id: partial.id ?? 'inv-seed',
    space_id: partial.space_id ?? 'space-1',
    email: partial.email ?? 'teammate@example.com',
    role: partial.role ?? 'editor',
    token: partial.token ?? 'tok-seed',
    status: partial.status ?? 'pending',
    invited_by: partial.invited_by ?? 'owner-0000-4000-a000-0000000ownr',
    expires_at: partial.expires_at ?? FUTURE,
    created_at: partial.created_at ?? new Date().toISOString(),
  }
  db.invites.push(row)
  return row
}

beforeEach(() => {
  db.invites = []
  db.updates = []
  currentProfileId = 'owner-0000-4000-a000-0000000ownr'
  resolvedSpace = {
    id: 'space-1',
    slug: 'river-studio',
    ownerProfileId: 'owner-0000-4000-a000-0000000ownr',
    name: 'River Studio',
    brandName: null,
  }
  canManageMembers = true
  addSpaceMember.mockClear()
  addSpaceMember.mockResolvedValue({ id: 'm1' })
  sendInviteEmail.mockClear()
  sendInviteEmail.mockResolvedValue(undefined)
})

describe('pure helpers (fail-closed)', () => {
  it('normalizeEmail trims + lower-cases, and rejects junk', () => {
    expect(normalizeEmail('  Teammate@Example.COM ')).toBe('teammate@example.com')
    expect(normalizeEmail('a@b.co')).toBe('a@b.co')
    expect(normalizeEmail('no-at-sign')).toBeNull()
    expect(normalizeEmail('no@domain')).toBeNull()
    expect(normalizeEmail('two @spaces.com')).toBeNull()
    expect(normalizeEmail('')).toBeNull()
    expect(normalizeEmail(42)).toBeNull()
  })

  it('normalizeInviteRole defaults unknowns to editor', () => {
    expect(normalizeInviteRole('admin')).toBe('admin')
    expect(normalizeInviteRole('viewer')).toBe('viewer')
    expect(normalizeInviteRole('overlord')).toBe('editor')
    expect(normalizeInviteRole(undefined)).toBe('editor')
  })

  it('generateInviteToken is non-empty + unique enough', () => {
    const a = generateInviteToken()
    const b = generateInviteToken()
    expect(a).toBeTruthy()
    expect(a).not.toBe(b)
    expect(a).not.toContain('-')
  })

  it('inviteAcceptUrl builds an absolute /spaces/invite/<token> link', () => {
    expect(inviteAcceptUrl('abc123')).toMatch(/\/spaces\/invite\/abc123$/)
  })

  it('isExpired treats missing / unparseable / past as expired, future as live', () => {
    expect(isExpired(undefined)).toBe(true)
    expect(isExpired('not-a-date')).toBe(true)
    expect(isExpired(PAST)).toBe(true)
    expect(isExpired(FUTURE)).toBe(false)
  })

  it('isInviteStatus is fail-closed', () => {
    expect(isInviteStatus('pending')).toBe(true)
    expect(isInviteStatus('accepted')).toBe(true)
    expect(isInviteStatus('revoked')).toBe(true)
    expect(isInviteStatus('zombie')).toBe(false)
    expect(isInviteStatus(7)).toBe(false)
  })
})

describe('createInvite — gated on canManageMembers', () => {
  it('an owner / admin creates a pending invite and gets the accept link', async () => {
    const result = await createInvite('space-1', 'Teammate@Example.com', 'moderator')
    expect(isError(result)).toBe(false)
    if (isError(result)) return
    expect(result.data.invite.email).toBe('teammate@example.com') // normalized
    expect(result.data.invite.role).toBe('moderator')
    expect(result.data.invite.status).toBe('pending')
    expect(result.data.acceptUrl).toContain(result.data.invite.token)
    expect(db.invites).toHaveLength(1)
  })

  it('a non-manager is rejected and nothing is written', async () => {
    canManageMembers = false
    const result = await createInvite('space-1', 'teammate@example.com', 'editor')
    expect(isError(result)).toBe(true)
    expect(db.invites).toHaveLength(0)
  })

  it('an anonymous caller is rejected', async () => {
    currentProfileId = null
    const result = await createInvite('space-1', 'teammate@example.com', 'editor')
    expect(isError(result)).toBe(true)
    expect(db.invites).toHaveLength(0)
  })

  it('rejects an invalid email before any write', async () => {
    const result = await createInvite('space-1', 'not-an-email', 'editor')
    expect(isError(result)).toBe(true)
    expect(db.invites).toHaveLength(0)
  })

  it('re-inviting the same email REFRESHES the live invite in place (one pending row)', async () => {
    const first = await createInvite('space-1', 'teammate@example.com', 'editor')
    const second = await createInvite('space-1', 'TEAMMATE@example.com', 'admin')
    expect(isError(first)).toBe(false)
    expect(isError(second)).toBe(false)
    if (isError(second)) return
    expect(db.invites.filter((r) => r.status === 'pending')).toHaveLength(1)
    expect(second.data.invite.role).toBe('admin') // role refreshed
  })

  it('emails the invitee the accept link (Space-context transactional invite)', async () => {
    const result = await createInvite('space-1', 'teammate@example.com', 'editor')
    expect(isError(result)).toBe(false)
    if (isError(result)) return
    expect(sendInviteEmail).toHaveBeenCalledTimes(1)
    expect(sendInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'teammate@example.com',
        contextKind: 'space',
        contextName: 'River Studio',
        inviteUrl: result.data.acceptUrl,
      }),
    )
  })

  it('RE-invite resends the refreshed link (matches Circle resend-on-reinvite)', async () => {
    await createInvite('space-1', 'teammate@example.com', 'editor')
    const second = await createInvite('space-1', 'teammate@example.com', 'admin')
    expect(isError(second)).toBe(false)
    if (isError(second)) return
    expect(sendInviteEmail).toHaveBeenCalledTimes(2)
    expect(sendInviteEmail).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: 'teammate@example.com', inviteUrl: second.data.acceptUrl }),
    )
  })

  it('a mail hiccup does NOT fail invite creation (fail-safe)', async () => {
    sendInviteEmail.mockRejectedValueOnce(new Error('queue down'))
    const result = await createInvite('space-1', 'teammate@example.com', 'editor')
    expect(isError(result)).toBe(false) // the invite row is still written + returned
    expect(db.invites.filter((r) => r.status === 'pending')).toHaveLength(1)
  })

  it('does not email when the caller is not a manager (nothing written, nothing sent)', async () => {
    canManageMembers = false
    const result = await createInvite('space-1', 'teammate@example.com', 'editor')
    expect(isError(result)).toBe(true)
    expect(sendInviteEmail).not.toHaveBeenCalled()
  })
})

describe('listInvites — gated on canManageMembers', () => {
  it('returns only PENDING invites for the Space, newest first', async () => {
    seedInvite({ id: 'a', token: 't-a', created_at: '2026-01-01T00:00:00Z' })
    seedInvite({ id: 'b', email: 'second@example.com', token: 't-b', created_at: '2026-02-01T00:00:00Z' })
    seedInvite({ id: 'c', email: 'old@example.com', token: 't-c', status: 'accepted' })
    seedInvite({ id: 'd', space_id: 'space-2', email: 'other@example.com', token: 't-d' })
    const list = await listInvites('space-1')
    expect(list.map((i) => i.id)).toEqual(['b', 'a']) // accepted + other-space dropped, newest first
  })

  it('a non-manager gets [] (fail-safe)', async () => {
    seedInvite()
    canManageMembers = false
    expect(await listInvites('space-1')).toEqual([])
  })

  it('drops a row with an unknown role (fail-closed)', async () => {
    seedInvite({ id: 'bad', role: 'overlord', token: 't-bad' })
    expect(await listInvites('space-1')).toEqual([])
  })
})

describe('revokeInvite — gated on canManageMembers', () => {
  it('an owner / admin revokes a pending invite (status -> revoked)', async () => {
    seedInvite({ id: 'rev-me', token: 't-rev' })
    const result = await revokeInvite('rev-me')
    expect(isError(result)).toBe(false)
    expect(db.invites.find((r) => r.id === 'rev-me')?.status).toBe('revoked')
  })

  it('a non-manager cannot revoke', async () => {
    seedInvite({ id: 'rev-me', token: 't-rev' })
    canManageMembers = false
    const result = await revokeInvite('rev-me')
    expect(isError(result)).toBe(true)
    expect(db.invites.find((r) => r.id === 'rev-me')?.status).toBe('pending')
  })

  it('an unknown invite id fails', async () => {
    const result = await revokeInvite('nope')
    expect(isError(result)).toBe(true)
  })
})

describe('acceptInvite — seats the authenticated invitee, fail-closed otherwise', () => {
  it('seats the caller at the invite role + active, and marks the invite accepted', async () => {
    seedInvite({ id: 'acc', token: 'good-token', role: 'moderator', expires_at: FUTURE })
    currentProfileId = 'invitee-000-4000-a000-00000invtee'
    const result = await acceptInvite('good-token')
    expect(isError(result)).toBe(false)
    if (isError(result)) return
    expect(result.data.spaceSlug).toBe('river-studio')
    expect(addSpaceMember).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: 'space-1',
        profileId: 'invitee-000-4000-a000-00000invtee',
        role: 'moderator',
        status: 'active',
      }),
    )
    expect(db.invites.find((r) => r.id === 'acc')?.status).toBe('accepted')
  })

  it('rejects an anonymous caller (no seat)', async () => {
    seedInvite({ token: 'good-token' })
    currentProfileId = null
    const result = await acceptInvite('good-token')
    expect(isError(result)).toBe(true)
    expect(addSpaceMember).not.toHaveBeenCalled()
  })

  it('rejects an unknown token', async () => {
    const result = await acceptInvite('does-not-exist')
    expect(isError(result)).toBe(true)
    expect(addSpaceMember).not.toHaveBeenCalled()
  })

  it('rejects an already-used (accepted) token', async () => {
    seedInvite({ token: 'used-token', status: 'accepted' })
    const result = await acceptInvite('used-token')
    expect(isError(result)).toBe(true)
    expect(addSpaceMember).not.toHaveBeenCalled()
  })

  it('rejects an expired token', async () => {
    seedInvite({ token: 'old-token', expires_at: PAST })
    const result = await acceptInvite('old-token')
    expect(isError(result)).toBe(true)
    expect(addSpaceMember).not.toHaveBeenCalled()
  })

  it('does not mark accepted if the seat fails', async () => {
    seedInvite({ id: 'seat-fails', token: 'seat-fail-token' })
    addSpaceMember.mockResolvedValueOnce(null)
    const result = await acceptInvite('seat-fail-token')
    expect(isError(result)).toBe(true)
    expect(db.invites.find((r) => r.id === 'seat-fails')?.status).toBe('pending')
  })
})
