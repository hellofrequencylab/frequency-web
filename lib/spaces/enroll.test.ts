import { describe, it, expect, beforeEach, vi } from 'vitest'

// ENROLLMENT (ENTITY-SPACES-SYSTEM §2.7, MASTER-PLAN ADMIN-02, enroll v1). What is locked here, all
// network-free (the supabase admin client + auth + store + capability seam are mocked):
//   1. PURE normalization is fail-closed: a nameless / malformed program is rejected; dates are
//      validated (a bad calendar date drops; an end-before-start drops the end); capacity is clamped;
//      only an explicit isPublished=false keeps a program drafted.
//   2. PERMISSION GATING on the actions: setSpaceProgram / listSpaceEnrollments require
//      canEditProfile (anonymous + non-editor are rejected, nothing is written / [] is returned).
//   3. ENROLL respects the one-active-enrollment rule + the capacity guard: a member already active
//      here is rejected (pre-check) and the unique-index race is translated into the same friendly
//      message; a full capped program refuses; a draft / missing program refuses.
//   4. CANCEL ownership: the member who enrolled may cancel; a non-member non-admin may not; a space
//      admin may cancel another member's.

// ── Mock the caller identity + Space resolver + capability seam (toggled per test) ──────────────
let currentProfileId: string | null = 'member-0000-4000-a000-0000000membr'
let currentWebRole: 'none' | 'admin' | 'janitor' = 'none'
vi.mock('@/lib/auth', () => ({
  getMyProfileId: async () => currentProfileId,
  getCallerProfile: async () =>
    currentProfileId ? { id: currentProfileId, webRole: currentWebRole } : null,
}))

let resolvedSpace: { id: string; slug: string; ownerProfileId?: string | null } | null = {
  id: 'space-1',
  slug: 'lumen-coaching',
  ownerProfileId: 'owner-0000-4000-a000-0000000ownr',
}
vi.mock('./store', () => ({
  getSpaceById: async () => resolvedSpace,
}))

let canEdit = true
let isAdmin = true
vi.mock('./entitlements', () => ({
  getSpaceCapabilities: async () => ({
    isOwner: canEdit,
    isAdmin,
    role: canEdit ? 'admin' : null,
    canEditProfile: canEdit,
    canManageMembers: isAdmin,
    canInvite: canEdit,
  }),
}))

// ── A chainable admin-client mock backed by an in-memory store ──────────────────────────────────
type ProgramRow = {
  id: string
  space_id: string
  name: string
  description: string | null
  schedule: string | null
  starts_on: string | null
  ends_on: string | null
  capacity: number
  is_published: boolean
}
type EnrollmentRow = {
  id: string
  space_id: string
  program_id: string
  member_profile_id: string
  status: string
  enrolled_at: string
}
const db = {
  programs: [] as ProgramRow[],
  enrollments: [] as EnrollmentRow[],
  profiles: [] as { id: string; display_name: string | null }[],
  inserts: [] as Record<string, unknown>[],
  deletes: [] as string[],
  // A switch to simulate the partial-unique-index rejection on a second active enrollment.
  failNextInsert: false,
}

function programsBuilder() {
  const filters: { space_id?: string } = {}
  let pendingInsert: Record<string, unknown> | null = null
  const api = {
    select() {
      return api
    },
    eq(col: string, val: string) {
      if (col === 'space_id') filters.space_id = val
      return api
    },
    order() {
      return api
    },
    delete() {
      return {
        async eq(_col: string, val: string) {
          db.deletes.push(val)
          db.programs = db.programs.filter((r) => r.space_id !== val)
          // Deleting a program cascades its enrollments (FK on delete cascade).
          db.enrollments = db.enrollments.filter((e) => e.space_id !== val)
          return { error: null }
        },
      }
    },
    insert(rows: Record<string, unknown>[]) {
      pendingInsert = rows[0] ?? null
      return api
    },
    async maybeSingle() {
      if (pendingInsert) {
        const row = { id: `p${db.programs.length}`, ...(pendingInsert as object) } as ProgramRow
        db.programs.push(row)
        db.inserts.push(pendingInsert)
        const out = pendingInsert
        pendingInsert = null
        return { data: row, error: out ? null : null }
      }
      const row = db.programs.find((r) => r.space_id === filters.space_id) ?? null
      return { data: row, error: null }
    },
  }
  return api
}

function enrollmentsBuilder() {
  const filters: {
    space_id?: string
    status?: string
    id?: string
    member_profile_id?: string
  } = {}
  let pendingInsert: Record<string, unknown> | null = null
  let pendingUpdate: Record<string, unknown> | null = null
  const api = {
    select() {
      return api
    },
    eq(col: string, val: string) {
      if (col === 'space_id') filters.space_id = val
      if (col === 'status') filters.status = val
      if (col === 'id') filters.id = val
      if (col === 'member_profile_id') filters.member_profile_id = val
      // an eq after update() is the terminal write
      if (pendingUpdate && col === 'id') {
        const row = db.enrollments.find((e) => e.id === val)
        if (row) Object.assign(row, pendingUpdate)
        return Promise.resolve({ error: null })
      }
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
      if (pendingInsert) {
        if (db.failNextInsert) {
          db.failNextInsert = false
          return { data: null, error: { code: '23505', message: 'duplicate key' } }
        }
        const row = {
          id: `e${db.enrollments.length}`,
          enrolled_at: '2026-06-20T00:00:00.000Z',
          ...(pendingInsert as object),
        } as EnrollmentRow
        db.enrollments.push(row)
        db.inserts.push(pendingInsert)
        pendingInsert = null
        return { data: row, error: null }
      }
      let rows = db.enrollments
      if (filters.id) rows = rows.filter((e) => e.id === filters.id)
      if (filters.space_id) rows = rows.filter((e) => e.space_id === filters.space_id)
      if (filters.member_profile_id)
        rows = rows.filter((e) => e.member_profile_id === filters.member_profile_id)
      if (filters.status) rows = rows.filter((e) => e.status === filters.status)
      return { data: rows[0] ?? null, error: null }
    },
    then(resolve: (r: { data: EnrollmentRow[] | null; error: null }) => unknown) {
      let data = db.enrollments.filter((e) => e.space_id === filters.space_id)
      if (filters.status) data = data.filter((e) => e.status === filters.status)
      return Promise.resolve(resolve({ data, error: null }))
    },
  }
  return api
}

function profilesBuilder() {
  return {
    select() {
      return {
        async in(_col: string, ids: string[]) {
          return { data: db.profiles.filter((p) => ids.includes(p.id)) }
        },
      }
    },
  }
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'space_programs') return programsBuilder()
      if (table === 'space_enrollments') return enrollmentsBuilder()
      if (table === 'profiles') return profilesBuilder()
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import {
  normalizeProgram,
  setSpaceProgram,
  getSpaceProgram,
  getProgramWithSeats,
  getSpaceProgramForOwner,
  getMyEnrollment,
  enrollInProgram,
  cancelEnrollment,
  listSpaceEnrollments,
} from './enroll'

beforeEach(() => {
  currentProfileId = 'member-0000-4000-a000-0000000membr'
  currentWebRole = 'none'
  resolvedSpace = {
    id: 'space-1',
    slug: 'lumen-coaching',
    ownerProfileId: 'owner-0000-4000-a000-0000000ownr',
  }
  canEdit = true
  isAdmin = true
  db.programs = []
  db.enrollments = []
  db.profiles = []
  db.inserts = []
  db.deletes = []
  db.failNextInsert = false
})

function seedProgram(over: Partial<ProgramRow> = {}) {
  db.programs.push({
    id: 'p0',
    space_id: 'space-1',
    name: 'Spring cohort',
    description: null,
    schedule: null,
    starts_on: null,
    ends_on: null,
    capacity: 0,
    is_published: true,
    ...over,
  })
}

describe('normalizeProgram (pure, fail-closed)', () => {
  it('rejects a nameless / blank-name program', () => {
    expect(normalizeProgram({ name: '' })).toBeNull()
    expect(normalizeProgram({ name: '   ' })).toBeNull()
    expect(normalizeProgram({})).toBeNull()
  })

  it('keeps a valid program and defaults sensibly', () => {
    const p = normalizeProgram({ name: ' Cohort A ' })
    expect(p).not.toBeNull()
    expect(p!.name).toBe('Cohort A')
    expect(p!.description).toBeNull()
    expect(p!.capacity).toBe(0)
    expect(p!.isPublished).toBe(true)
  })

  it('only an explicit isPublished=false keeps a program drafted', () => {
    expect(normalizeProgram({ name: 'X', isPublished: false })!.isPublished).toBe(false)
    expect(normalizeProgram({ name: 'X', isPublished: undefined })!.isPublished).toBe(true)
  })

  it('validates dates: a bad calendar date drops to null', () => {
    expect(normalizeProgram({ name: 'X', startsOn: '2026-13-40' })!.startsOn).toBeNull()
    expect(normalizeProgram({ name: 'X', startsOn: 'soon' })!.startsOn).toBeNull()
    expect(normalizeProgram({ name: 'X', startsOn: '2026-06-20' })!.startsOn).toBe('2026-06-20')
  })

  it('drops an end-before-start end date but keeps the start', () => {
    const p = normalizeProgram({ name: 'X', startsOn: '2026-06-20', endsOn: '2026-06-10' })!
    expect(p.startsOn).toBe('2026-06-20')
    expect(p.endsOn).toBeNull()
  })

  it('clamps a negative / NaN capacity to 0 (no cap)', () => {
    expect(normalizeProgram({ name: 'X', capacity: -5 })!.capacity).toBe(0)
    expect(normalizeProgram({ name: 'X', capacity: Number.NaN })!.capacity).toBe(0)
    expect(normalizeProgram({ name: 'X', capacity: 12 })!.capacity).toBe(12)
  })
})

describe('setSpaceProgram (gated on canEditProfile)', () => {
  it('rejects an anonymous caller and writes nothing', async () => {
    currentProfileId = null
    const r = await setSpaceProgram('space-1', { name: 'Cohort' })
    expect('error' in r).toBe(true)
    expect(db.programs).toHaveLength(0)
  })

  it('rejects a non-editor and writes nothing', async () => {
    canEdit = false
    const r = await setSpaceProgram('space-1', { name: 'Cohort' })
    expect('error' in r).toBe(true)
    expect(db.programs).toHaveLength(0)
  })

  it('rejects a nameless program', async () => {
    const r = await setSpaceProgram('space-1', { name: '   ' })
    expect('error' in r).toBe(true)
    expect(db.programs).toHaveLength(0)
  })

  it('replaces the program (one per space) for an editor', async () => {
    seedProgram({ name: 'Old' })
    const r = await setSpaceProgram('space-1', { name: 'New cohort', capacity: 10 })
    expect('data' in r).toBe(true)
    expect(db.programs).toHaveLength(1)
    expect(db.programs[0]!.name).toBe('New cohort')
    expect(db.programs[0]!.capacity).toBe(10)
  })
})

describe('getSpaceProgram / getSpaceProgramForOwner (publish gating)', () => {
  it('getSpaceProgram returns a published program but hides a draft', async () => {
    seedProgram({ is_published: true })
    expect((await getSpaceProgram('space-1'))?.name).toBe('Spring cohort')
    db.programs = []
    seedProgram({ is_published: false })
    expect(await getSpaceProgram('space-1')).toBeNull()
  })

  it('getSpaceProgramForOwner reads a draft for an editor, but null for a non-editor non-janitor', async () => {
    seedProgram({ is_published: false })
    expect((await getSpaceProgramForOwner('space-1'))?.name).toBe('Spring cohort')
    canEdit = false
    currentWebRole = 'none'
    expect(await getSpaceProgramForOwner('space-1')).toBeNull()
  })
})

describe('enrollInProgram (one-active rule + capacity guard)', () => {
  it('refuses when there is no published program', async () => {
    const r = await enrollInProgram('space-1')
    expect('error' in r).toBe(true)
  })

  it('records an enrollment against a published program', async () => {
    seedProgram()
    const r = await enrollInProgram('space-1')
    expect('data' in r).toBe(true)
    expect(db.enrollments).toHaveLength(1)
    expect(db.enrollments[0]!.status).toBe('active')
    expect(db.enrollments[0]!.program_id).toBe('p0')
  })

  it('rejects a second active enrollment for the same member (pre-check)', async () => {
    seedProgram()
    await enrollInProgram('space-1')
    const r = await enrollInProgram('space-1')
    expect('error' in r).toBe(true)
    expect(db.enrollments).toHaveLength(1)
  })

  it('refuses when a capped program is full', async () => {
    seedProgram({ capacity: 1 })
    db.enrollments.push({
      id: 'e-other',
      space_id: 'space-1',
      program_id: 'p0',
      member_profile_id: 'someone-else',
      status: 'active',
      enrolled_at: '2026-06-19T00:00:00.000Z',
    })
    const r = await enrollInProgram('space-1')
    expect('error' in r).toBe(true)
    expect(db.enrollments).toHaveLength(1)
  })

  it('translates the unique-index race into the friendly message', async () => {
    seedProgram()
    db.failNextInsert = true
    const r = await enrollInProgram('space-1')
    expect('error' in r).toBe(true)
  })
})

describe('cancelEnrollment (ownership)', () => {
  function seedEnrollment(memberId: string, id = 'e0') {
    db.enrollments.push({
      id,
      space_id: 'space-1',
      program_id: 'p0',
      member_profile_id: memberId,
      status: 'active',
      enrolled_at: '2026-06-20T00:00:00.000Z',
    })
  }

  it('lets the member who enrolled cancel their own', async () => {
    seedEnrollment(currentProfileId!)
    canEdit = false
    isAdmin = false
    const r = await cancelEnrollment('e0')
    expect('data' in r).toBe(true)
    expect(db.enrollments[0]!.status).toBe('cancelled')
  })

  it('rejects a non-member non-admin', async () => {
    seedEnrollment('someone-else')
    canEdit = false
    isAdmin = false
    const r = await cancelEnrollment('e0')
    expect('error' in r).toBe(true)
    expect(db.enrollments[0]!.status).toBe('active')
  })

  it('lets a space admin cancel another member enrollment', async () => {
    seedEnrollment('someone-else')
    isAdmin = true
    const r = await cancelEnrollment('e0')
    expect('data' in r).toBe(true)
    expect(db.enrollments[0]!.status).toBe('cancelled')
  })
})

describe('getProgramWithSeats / getMyEnrollment / listSpaceEnrollments', () => {
  it('computes seatsLeft (null for no cap, floored at 0 for a cap)', async () => {
    seedProgram({ capacity: 0 })
    expect((await getProgramWithSeats('space-1'))?.seatsLeft).toBeNull()
    db.programs = []
    seedProgram({ capacity: 2 })
    expect((await getProgramWithSeats('space-1'))?.seatsLeft).toBe(2)
  })

  it('getMyEnrollment returns the viewer active enrollment or null', async () => {
    seedProgram()
    expect(await getMyEnrollment('space-1')).toBeNull()
    await enrollInProgram('space-1')
    expect((await getMyEnrollment('space-1'))?.id).toBeTruthy()
  })

  it('listSpaceEnrollments is gated on canEditProfile and resolves names', async () => {
    seedProgram()
    db.profiles.push({ id: currentProfileId!, display_name: 'Avery' })
    await enrollInProgram('space-1')
    const list = await listSpaceEnrollments('space-1')
    expect(list).toHaveLength(1)
    expect(list[0]!.memberName).toBe('Avery')

    canEdit = false
    currentWebRole = 'none'
    expect(await listSpaceEnrollments('space-1')).toEqual([])
  })
})
