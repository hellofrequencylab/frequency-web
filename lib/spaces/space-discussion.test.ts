import { describe, it, expect, vi, beforeEach } from 'vitest'

const db: { circles: Record<string, unknown>[] } = { circles: [] }

function builder() {
  const eqs: Array<[string, unknown]> = []
  const inClauses: Array<{ col: string; vals: unknown[] }> = []
  function rows() {
    let out = db.circles
    for (const [col, val] of eqs) out = out.filter((r) => r[col] === val)
    for (const c of inClauses) out = out.filter((r) => c.vals.includes(r[c.col]))
    return out
  }
  const api = {
    select: () => api,
    eq(col: string, val: unknown) {
      eqs.push([col, val])
      return api
    },
    in(col: string, vals: unknown[]) {
      inClauses.push({ col, vals })
      return api
    },
    async limit(n: number) {
      return { data: rows().slice(0, n), error: null }
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => builder() }),
}))

import {
  canSeeSpaceDiscussionTab,
  getLiveSpaceCircle,
  isLiveSpaceHub,
} from './space-discussion'

const SPACE = 'aaaaaaaa-0000-4000-a000-00000000000a'

beforeEach(() => {
  db.circles = []
})

describe('isLiveSpaceHub', () => {
  it('needs the Space Circle flag and a listable status', () => {
    expect(isLiveSpaceHub(null)).toBe(false)
    expect(isLiveSpaceHub({ is_space_primary: true, status: 'active' })).toBe(true)
    expect(isLiveSpaceHub({ is_space_primary: true, status: 'forming' })).toBe(true)
    expect(isLiveSpaceHub({ is_space_primary: true, status: 'inactive' })).toBe(false)
    expect(isLiveSpaceHub({ is_space_primary: false, status: 'active' })).toBe(false)
  })
})

describe('canSeeSpaceDiscussionTab', () => {
  it('ROOT never offers it', () => {
    expect(
      canSeeSpaceDiscussionTab({ spaceType: 'root', hubLive: true, canManage: true }),
    ).toBe(false)
  })

  it('a live hub is offered to anyone who can already see the Space', () => {
    expect(
      canSeeSpaceDiscussionTab({ spaceType: 'business', hubLive: true, canManage: false }),
    ).toBe(true)
  })

  it('a manager keeps the tab when the hub is off', () => {
    expect(
      canSeeSpaceDiscussionTab({ spaceType: 'business', hubLive: false, canManage: true }),
    ).toBe(true)
  })

  it('a visitor is never offered a tab over a room that is not there', () => {
    expect(
      canSeeSpaceDiscussionTab({ spaceType: 'business', hubLive: false, canManage: false }),
    ).toBe(false)
  })
})

describe('getLiveSpaceCircle', () => {
  it('returns the on hub and hides an off one', async () => {
    db.circles = [
      {
        id: 'hub',
        slug: 'ojai-hub',
        name: 'Ojai',
        status: 'active',
        is_space_primary: true,
        space_id: SPACE,
      },
    ]
    const live = await getLiveSpaceCircle(SPACE)
    expect(live?.id).toBe('hub')

    db.circles[0].status = 'inactive'
    expect(await getLiveSpaceCircle(SPACE)).toBeNull()
  })

  it('never reaches another Space', async () => {
    db.circles = [
      {
        id: 'theirs',
        slug: 'theirs',
        name: 'Theirs',
        status: 'active',
        is_space_primary: true,
        space_id: 'bbbbbbbb-0000-4000-a000-00000000000b',
      },
    ]
    expect(await getLiveSpaceCircle(SPACE)).toBeNull()
  })
})
