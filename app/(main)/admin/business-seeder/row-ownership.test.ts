import { describe, it, expect, vi, beforeEach } from 'vitest'

// SMART BUSINESS IMPORTER — the PER-ROW ownership rule.
//
// The staff gate answers "may you use this console". It does not answer "may you act on THAT
// row", and those are different questions: every per-row action used to fetch by intake id
// alone, so any operator who cleared structure:write and held another operator's row id could
// open, edit, re-seed and apply it. The rule locked here is the caller's OWN row (created_by,
// the same bind as the console list), or ANY row when the caller is a PLATFORM ADMIN (web_role
// admin / janitor) — the deliberate "Re-seed an existing Space" power, which routes an admin
// into a master profile another operator created.
//
// Network-free: the staff gate, auth, the store, the admin client and every pipeline seam are
// mocked. The review model + the image-order helpers run for real (they are pure).

const OWNER = 'op-1111-4000-a000-00000000owner'
const STRANGER = 'op-2222-4000-a000-000000stranger'
const ROW_ID = 'intake-3333-4000-a000-0000000000row'
const IMAGE = 'https://cdn.test/library-media/intake/x/a.jpg'

// ── The caller: profile id + web_role, both swapped per test ─────────────────────────────────
let caller = { id: OWNER, webRole: 'none' as 'none' | 'admin' | 'janitor' }
vi.mock('@/lib/staff', () => ({ requireStaffCap: async () => ({ profileId: caller.id, role: 'owner' }) }))
vi.mock('@/lib/auth', () => ({
  getCallerProfile: async () => ({ id: caller.id, community_role: 'member', webRole: caller.webRole }),
  getMyProfileId: async () => caller.id,
}))

// ── The store: ONE intake created by OWNER, already applied to a Space ───────────────────────
const row = {
  id: ROW_ID,
  createdBy: OWNER,
  status: 'applied' as const,
  inputs: { consent: { isDemo: true }, images: [IMAGE], lockHero: true },
  draft: { name: 'Kai Yoga', type: 'business', tagline: 'Breathe' },
  ledger: {},
  rawSources: [],
  targetSpaceId: 'space-4444-4000-a000-00000000space',
  error: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z',
}

const saveDraft = vi.fn(async () => true)
const setInputs = vi.fn(async () => true)
const setStatus = vi.fn(async () => true)

vi.mock('@/lib/importer/store', () => ({
  // The caller-bound read: the row ONLY when created_by matches.
  getIntakeForOperator: async (id: string, operatorId: string) =>
    id === row.id && operatorId === row.createdBy ? row : null,
  // The unbound read: any row, by id alone.
  getIntake: async (id: string) => (id === row.id ? row : null),
  createIntake: async () => 'new-intake',
  intakeIdsBySpaceIds: async () => ({}),
  saveDraft: (...a: unknown[]) => saveDraft(...(a as [])),
  setInputs: (...a: unknown[]) => setInputs(...(a as [])),
  setStatus: (...a: unknown[]) => setStatus(...(a as [])),
}))

// ── The write seams we assert are never reached for a stranger ───────────────────────────────
const applyIntake = vi.fn(async () => ({ ok: true as const, spaceId: 'space-4444-4000-a000-00000000space', slug: 'kai-yoga' }))
const runResearch = vi.fn(async () => {})
const enqueueResearch = vi.fn(async () => {})
const spaceUpdate = vi.fn((patch: Record<string, unknown>) => patch)

vi.mock('@/lib/importer/materialize', () => ({
  applyIntake: (...a: unknown[]) => applyIntake(...(a as [])),
  fileSeedImagesIntoLoom: async () => [],
}))
vi.mock('@/lib/importer/queue', () => ({ enqueueResearch: (...a: unknown[]) => enqueueResearch(...(a as [])) }))
vi.mock('@/lib/importer/pipeline', () => ({
  runResearch: (...a: unknown[]) => runResearch(...(a as [])),
  EDITABLE_PROSE_FIELDS: ['tagline', 'about', 'story'] as const,
  nextEditedProse: () => ({}),
  editedProsePaths: () => [],
}))
vi.mock('@/lib/importer/reframe', () => ({ reframe: async () => null, applyReframe: () => ({ draft: row.draft, ledger: {} }) }))
vi.mock('@/lib/importer/vision', () => ({
  planSeedImages: async () => ({ order: [IMAGE], items: [{ url: IMAGE, category: 'space', alt: 'a', heroScore: 1 }], heroUrl: IMAGE }),
}))
vi.mock('@/lib/importer/adopt', () => ({ adoptSpaceAsMasterProfile: async () => ({ ok: true, intakeId: ROW_ID, created: false }) }))
vi.mock('@/lib/spaces/claim', () => ({ mintSpaceClaimToken: async () => 'token' }))
vi.mock('@/lib/spaces/store', () => ({ listSpaces: async () => [] }))
vi.mock('next/server', () => ({ after: () => {} }))

// A tiny chainable admin-client stub: the visibility read, the spaces update, and storage.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { visibility: 'network' } }) }) }),
      update: (patch: Record<string, unknown>) => {
        spaceUpdate(patch)
        return { eq: async () => ({ error: null }) }
      },
    }),
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        remove: async () => ({ error: null }),
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/library-media/${p}` } }),
      }),
    },
  }),
}))

const actions = await import('./actions')

beforeEach(() => {
  caller = { id: OWNER, webRole: 'none' }
  saveDraft.mockClear()
  setInputs.mockClear()
  setStatus.mockClear()
  applyIntake.mockClear()
  runResearch.mockClear()
  enqueueResearch.mockClear()
  spaceUpdate.mockClear()
})

/** Every per-row action, called with the row id. One list, so a new action is added here too. */
const PER_ROW: { name: string; run: () => Promise<{ ok?: boolean; error?: string | null } | null> }[] = [
  { name: 'getBusinessImportReview', run: () => actions.getBusinessImportReview(ROW_ID) },
  { name: 'uploadSeederImages', run: () => actions.uploadSeederImages(ROW_ID, new FormData()) },
  { name: 'removeSeederImage', run: () => actions.removeSeederImage(ROW_ID, IMAGE) },
  { name: 'setPrimarySeederImage', run: () => actions.setPrimarySeederImage(ROW_ID, IMAGE) },
  { name: 'reorderSeederImages', run: () => actions.reorderSeederImages(ROW_ID, [IMAGE]) },
  { name: 'autoArrangeSeederImages', run: () => actions.autoArrangeSeederImages(ROW_ID) },
  { name: 'reseedBusinessImport', run: () => actions.reseedBusinessImport(ROW_ID, 'warm') },
  { name: 'reresearchWithInfo', run: () => actions.reresearchWithInfo(ROW_ID, { directions: 'warmer' }) },
  { name: 'setBusinessListed', run: () => actions.setBusinessListed(ROW_ID, true) },
  { name: 'updateImportField', run: () => actions.updateImportField(ROW_ID, 'tagline', { kind: 'edit', value: 'Breathe out' }) },
  { name: 'approveBusinessImport', run: () => actions.approveBusinessImport(ROW_ID) },
]

describe('business seeder — the caller may act on their own row', () => {
  it('reads the review board', async () => {
    const review = await actions.getBusinessImportReview(ROW_ID)
    expect(review?.id).toBe(ROW_ID)
  })

  it.each(PER_ROW.filter((a) => a.name !== 'getBusinessImportReview'))(
    'reaches past the ownership check in $name',
    async ({ run }) => {
      const res = await run()
      // Either it succeeded, or it failed for a REASON OF ITS OWN (an empty upload) — never
      // for "not found", which is what a refused row returns.
      expect(res).not.toBeNull()
      expect(res?.error ?? '').not.toBe('Import not found.')
    },
  )

  it('approves it, which reaches the materializer', async () => {
    const res = await actions.approveBusinessImport(ROW_ID)
    expect(res.ok).toBe(true)
    expect(applyIntake).toHaveBeenCalled()
  })
})

describe("business seeder — another operator's row is refused", () => {
  beforeEach(() => {
    caller = { id: STRANGER, webRole: 'none' }
  })

  it.each(PER_ROW)('refuses $name with the honest empty state', async ({ run }) => {
    const res = await run()
    if (res === null) return // getBusinessImportReview: null IS the refusal
    expect(res.ok).toBe(false)
    expect(res.error).toBe('Import not found.')
  })

  it('writes nothing at all across every per-row action', async () => {
    for (const action of PER_ROW) await action.run()
    expect(saveDraft).not.toHaveBeenCalled()
    expect(setInputs).not.toHaveBeenCalled()
    expect(setStatus).not.toHaveBeenCalled()
    expect(applyIntake).not.toHaveBeenCalled()
    expect(runResearch).not.toHaveBeenCalled()
    expect(spaceUpdate).not.toHaveBeenCalled()
  })
})

describe("business seeder — a platform admin may act on another operator's row", () => {
  // This is the deliberate power: an admin picks any active Space from the re-seed search,
  // lands on ITS master profile (created by whoever seeded it), and works the board.
  it.each(PER_ROW)('admits an admin to $name', async ({ run }) => {
    caller = { id: STRANGER, webRole: 'admin' }
    const res = await run()
    expect(res).not.toBeNull()
    expect(res?.error ?? '').not.toBe('Import not found.')
  })

  it('admits a janitor to the review board', async () => {
    caller = { id: STRANGER, webRole: 'janitor' }
    expect((await actions.getBusinessImportReview(ROW_ID))?.id).toBe(ROW_ID)
  })

  it('lets an admin re-seed and re-apply a row they do not own', async () => {
    caller = { id: STRANGER, webRole: 'admin' }
    const res = await actions.reseedBusinessImport(ROW_ID, 'warm')
    expect(res.ok).toBe(true)
    expect(applyIntake).toHaveBeenCalled()
  })
})
