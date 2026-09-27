import { describe, it, expect, beforeEach, vi } from 'vitest'

// LIVE-521 — A SPACE-ONLY MEMBER MUST BE REACHABLE BY THE WEEKLY DIGEST.
//
// `listProfileIdsForDigest` built the recipient set from circle `memberships` alone, while the
// payload it feeds (`assembleDigestForProfile`) has been Space-aware since ADR-858. So a member
// whose only home is a Space was structurally unreachable by the one recurring email the platform
// sends, no matter what their Space did. A Space OWNER was worse off still: ADR-858 gives them no
// `space_members` row at all, so membership alone would have left them unreachable too.
//
// These tests drive the REAL function against a mocked database whose builder APPLIES the filters
// the code actually asked for. A test that asserted `.eq("status", "active")` was called would
// measure the shape of the query; this one measures the consequence — who is in the returned set.
//
// The audience protections are asserted SEPARATELY, one `it` each, so a passing count cannot hide
// a broken filter behind a working one.

type MemberRow = { profile_id: string; status: string }
type SpaceRow = { id: string; owner_profile_id: string | null }

let memberships: MemberRow[]
let spaceMembers: MemberRow[]
let spaces: SpaceRow[]

function table(name: string) {
  const eqs: [string, unknown][] = []
  let columns = ''
  function rows() {
    const source: Record<string, unknown>[] =
      name === 'memberships'
        ? memberships
        : name === 'space_members'
          ? spaceMembers
          : name === 'spaces'
            ? spaces
            : []
    let out = source
    for (const [col, val] of eqs) out = out.filter((r) => r[col] === val)
    // Project only the selected columns, so a read of a column it did not ask for cannot pass.
    const wanted = columns.split(',').map((c) => c.trim()).filter(Boolean)
    return {
      data: out.map((r) => Object.fromEntries(wanted.map((c) => [c, r[c]]))),
      error: null,
    }
  }
  const api: Record<string, unknown> = {
    select: (cols: string) => {
      columns = cols
      return api
    },
    eq(col: string, val: unknown) {
      eqs.push([col, val])
      return api
    },
    // Every read here terminates on the builder itself (no .order()/.limit()).
    then(res: (v: { data: unknown; error: null }) => void) {
      res(rows())
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (n: string) => table(n) }) }))

const { listProfileIdsForDigest } = await import('@/lib/digest')

beforeEach(() => {
  memberships = [
    { profile_id: 'circle-only', status: 'active' },
    { profile_id: 'both', status: 'active' },
    { profile_id: 'circle-cancelled', status: 'cancelled' },
  ]
  spaceMembers = [
    { profile_id: 'space-only', status: 'active' },
    { profile_id: 'both', status: 'active' },
    { profile_id: 'space-invited', status: 'invited' },
    { profile_id: 'space-suspended', status: 'suspended' },
  ]
  spaces = [
    { id: 's1', owner_profile_id: 'space-owner' },
    { id: 's2', owner_profile_id: null },
  ]
})

describe('the weekly digest can reach a Space-only member (LIVE-521)', () => {
  it('includes a profile whose ONLY membership is a Space', async () => {
    const ids = await listProfileIdsForDigest()
    expect(ids).toContain('space-only')
  })

  it('includes a Space owner, who holds no space_members row (ADR-858)', async () => {
    const ids = await listProfileIdsForDigest()
    expect(ids).toContain('space-owner')
  })

  it('still includes a Circle-only member — the union added an arm, it did not replace one (control)', async () => {
    const ids = await listProfileIdsForDigest()
    expect(ids).toContain('circle-only')
  })

  it('excludes a Space member whose seat is only invited', async () => {
    const ids = await listProfileIdsForDigest()
    expect(ids).not.toContain('space-invited')
  })

  it('excludes a Space member whose seat is suspended', async () => {
    const ids = await listProfileIdsForDigest()
    expect(ids).not.toContain('space-suspended')
  })

  it('excludes a cancelled Circle membership', async () => {
    const ids = await listProfileIdsForDigest()
    expect(ids).not.toContain('circle-cancelled')
  })

  it('lists someone in BOTH a Circle and a Space exactly once', async () => {
    const ids = await listProfileIdsForDigest()
    expect(ids.filter((id) => id === 'both')).toHaveLength(1)
  })

  it('never emits a null id for an unowned Space', async () => {
    const ids = await listProfileIdsForDigest()
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true)
  })

  it('returns the whole candidate set and nothing else', async () => {
    const ids = await listProfileIdsForDigest()
    expect([...ids].sort()).toEqual(['both', 'circle-only', 'space-only', 'space-owner'])
  })

  it('reaches nobody when there is nobody, rather than throwing (fail-safe)', async () => {
    memberships = []
    spaceMembers = []
    spaces = []
    expect(await listProfileIdsForDigest()).toEqual([])
  })
})
