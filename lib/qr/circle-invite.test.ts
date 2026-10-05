import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { qrCodeMinterMayInvite, isSpaceSteward } from './circle-invite'

// SCAN-774. Who may turn a circle QR code into an invite: the Host, a steward of the circle's
// Space (owner or active editor+), platform staff, or an operator code with no minter at all.
// Everyone else minted a plain link to the circle's public face. Table-aware fake admin client,
// network-free.

let ownedSpace: { id: string } | null = null
let seat: { role: string } | null = null
let profile: { web_role: string | null } | null = null
let throwOn: string | null = null
const reads: string[] = []

function fakeAdmin(): SupabaseClient {
  const rowFor = (table: string) => {
    if (table === 'spaces') return ownedSpace
    if (table === 'space_members') return seat
    if (table === 'profiles') return profile
    return null
  }
  const chain = (table: string) => {
    const node: Record<string, unknown> = {}
    node.eq = () => node
    node.maybeSingle = async () => {
      reads.push(table)
      if (throwOn === table) throw new Error('db away')
      return { data: rowFor(table), error: null }
    }
    return node
  }
  // A test double for three narrow reads; the real client's generics are not under test here.
  // eslint-disable-next-line no-restricted-syntax
  return { from: (table: string) => ({ select: () => chain(table) }) } as unknown as SupabaseClient
}

const CIRCLE = { host_id: 'host-1', space_id: 'space-1' }

beforeEach(() => {
  ownedSpace = null
  seat = null
  profile = { web_role: 'none' }
  throwOn = null
  reads.length = 0
})

describe('qrCodeMinterMayInvite', () => {
  it('the Host may, without a single read', async () => {
    const may = await qrCodeMinterMayInvite(fakeAdmin(), { created_by: 'host-1', owner_profile_id: null }, CIRCLE)
    expect(may).toBe(true)
    expect(reads).toHaveLength(0)
  })

  it('an operator code (no minter at all) may: only the service role writes such a row', async () => {
    const may = await qrCodeMinterMayInvite(fakeAdmin(), { created_by: null, owner_profile_id: null }, CIRCLE)
    expect(may).toBe(true)
    expect(reads).toHaveLength(0)
  })

  it('🔴 a member who minted their own code pointing at somebody else`s circle may NOT', async () => {
    const may = await qrCodeMinterMayInvite(fakeAdmin(), { created_by: 'member-9', owner_profile_id: 'member-9' }, CIRCLE)
    expect(may).toBe(false)
  })

  it('the Space owner may', async () => {
    ownedSpace = { id: 'space-1' }
    const may = await qrCodeMinterMayInvite(fakeAdmin(), { created_by: 'owner-1', owner_profile_id: 'owner-1' }, CIRCLE)
    expect(may).toBe(true)
  })

  for (const role of ['editor', 'moderator', 'admin']) {
    it(`an active ${role} seat on the Space may`, async () => {
      seat = { role }
      const may = await qrCodeMinterMayInvite(fakeAdmin(), { created_by: 'staffer-1', owner_profile_id: 'staffer-1' }, CIRCLE)
      expect(may).toBe(true)
    })
  }

  it('a plain viewer seat may NOT: a viewer cannot invite by hand either', async () => {
    seat = { role: 'viewer' }
    const may = await qrCodeMinterMayInvite(fakeAdmin(), { created_by: 'viewer-1', owner_profile_id: 'viewer-1' }, CIRCLE)
    expect(may).toBe(false)
  })

  it('a personal circle (no Space) still opens for the Host and for staff, and for nobody else', async () => {
    const personal = { host_id: 'host-1', space_id: null }
    expect(await qrCodeMinterMayInvite(fakeAdmin(), { created_by: 'host-1', owner_profile_id: null }, personal)).toBe(true)
    profile = { web_role: 'janitor' }
    expect(await qrCodeMinterMayInvite(fakeAdmin(), { created_by: 'j-1', owner_profile_id: 'j-1' }, personal)).toBe(true)
    profile = { web_role: 'none' }
    expect(await qrCodeMinterMayInvite(fakeAdmin(), { created_by: 'm-1', owner_profile_id: 'm-1' }, personal)).toBe(false)
    expect(reads).not.toContain('spaces')
  })

  for (const webRole of ['admin', 'janitor']) {
    it(`platform staff (${webRole}) may`, async () => {
      profile = { web_role: webRole }
      const may = await qrCodeMinterMayInvite(fakeAdmin(), { created_by: 'staff-1', owner_profile_id: null }, CIRCLE)
      expect(may).toBe(true)
    })
  }

  it('a curated moderator is not staff for this purpose', async () => {
    profile = { web_role: 'moderator' }
    const may = await qrCodeMinterMayInvite(fakeAdmin(), { created_by: 'mod-1', owner_profile_id: null }, CIRCLE)
    expect(may).toBe(false)
  })

  it('falls back to owner_profile_id when created_by is unset', async () => {
    const may = await qrCodeMinterMayInvite(fakeAdmin(), { created_by: null, owner_profile_id: 'host-1' }, CIRCLE)
    expect(may).toBe(true)
  })

  it('FAIL-CLOSED: a read that throws is "not trusted"', async () => {
    throwOn = 'profiles'
    const may = await qrCodeMinterMayInvite(fakeAdmin(), { created_by: 'x-1', owner_profile_id: 'x-1' }, CIRCLE)
    expect(may).toBe(false)
  })
})

describe('isSpaceSteward', () => {
  it('owner, editor+ seat; never a viewer or a stranger', async () => {
    expect(await isSpaceSteward(fakeAdmin(), 'space-1', 'p')).toBe(false)
    seat = { role: 'viewer' }
    expect(await isSpaceSteward(fakeAdmin(), 'space-1', 'p')).toBe(false)
    seat = { role: 'editor' }
    expect(await isSpaceSteward(fakeAdmin(), 'space-1', 'p')).toBe(true)
    seat = null
    ownedSpace = { id: 'space-1' }
    expect(await isSpaceSteward(fakeAdmin(), 'space-1', 'p')).toBe(true)
  })
})
