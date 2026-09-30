import { describe, it, expect, vi, beforeEach } from 'vitest'

// ONE GATE FOR THE JOURNEY EDITOR (LIVE-732, ADR-1686). The editor page and every save action in
// ./actions.ts must admit exactly the same people, because both ask `canEditJourney`
// (lib/journeys/authoring.ts): the author, a platform operator (admin.access), or a manager of the
// Space the Journey belongs to (team authoring). Before LIVE-732 the actions carried their own
// author-or-operator copy, so a Space manager opened the editor and every save was refused.
//
// The REAL canEditJourney runs here. Only its readers (the plan's author and Space, the root space,
// the caller's Space capabilities, the operator capability) and the admin client are stubbed, so each
// case asks the page and an action the same question and expects the same answer.

const mocks = vi.hoisted(() => ({
  caller: null as { id: string } | null,
  operator: false,
  author: 'profile-author',
  spaceId: 'space-team' as string | null,
  rootId: 'space-root',
  manager: false,
  writes: [] as Array<{ table: string; op: string }>,
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT ${to}`)
  }),
}))

const PLAN = 'plan-1'
const SLUG = 'first-light'

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => mocks.caller }))
vi.mock('@/lib/core/load-capabilities', () => ({
  getGlobalCapabilities: async () => new Set(mocks.operator ? ['admin.access'] : []),
}))
vi.mock('@/lib/journey-plans', () => ({
  getPlan: async () => ({ plan: { id: PLAN, slug: SLUG, author_id: mocks.author, title: 'First Light' }, items: [] }),
  planAuthorId: async () => mocks.author,
  planSpaceId: async () => mocks.spaceId,
  getVeraReview: async () => null,
  normalizeJourneyMeeting: () => null,
}))
vi.mock('@/lib/spaces/store', () => ({
  getSpaceById: async (id: string) => ({ id }),
  loadRootSpaceId: async () => mocks.rootId,
}))
vi.mock('@/lib/spaces/entitlements', () => ({
  getSpaceCapabilities: async () => ({ canEditProfile: mocks.manager }),
}))
vi.mock('@/lib/practices', () => ({ listPublicPractices: async () => [], createPractice: vi.fn() }))
vi.mock('@/lib/pillars', () => ({ getPillars: async () => [] }))
vi.mock('@/lib/journeys/store', () => ({ parseCheck: () => null }))
vi.mock('@/lib/ai/journey-edit', () => ({ planJourneyEdits: vi.fn() }))
vi.mock('@/lib/ai/journey-slot-coaching', () => ({ draftSlotCoaching: vi.fn() }))
vi.mock('@/lib/seasons', () => ({ getCurrentSeason: vi.fn() }))
vi.mock('@/lib/journeys/portable', () => ({ toPortable: vi.fn() }))
vi.mock('@/lib/journeys/compose', () => ({
  pillarIdsBySlug: vi.fn(),
  composeIntoPhase: vi.fn(),
  insertChildren: vi.fn(),
  extraCreditRow: vi.fn(),
  PILLAR_SLOTS: [],
  EXTRA_CREDIT_PLACEHOLDER: { title: '', body: '' },
}))
// The page's client components are not rendered here; the gate is what is under test.
vi.mock('@/components/journey/v2/journey-editor', () => ({ JourneyEditor: () => null }))
vi.mock('@/components/journey/v2/journey-settings', () => ({ JourneySettings: () => null }))
vi.mock('@/components/journey/v2/journey-advanced', () => ({ JourneyAdvanced: () => null }))
vi.mock('@/components/journey/v2/journey-builder', () => ({ JourneyBuilder: () => null }))
vi.mock('@/components/journey/v2/journey-composer', () => ({ JourneyComposer: () => null }))
vi.mock('@/components/journey/v2/journey-danger-zone', () => ({ JourneyDangerZone: () => null }))
vi.mock('@/components/journey/v2/journey-export', () => ({ JourneyExport: () => null }))

// A recording admin client: every write is logged and lands; reads answer with a practice row.
function builder(table: string) {
  const api: Record<string, unknown> = {}
  let writing = false
  const self = () => api
  api.select = self
  api.eq = self
  api.is = self
  api.order = self
  api.limit = self
  api.maybeSingle = async () => ({ data: { id: 'item-1', slug: SLUG, author_id: mocks.author, settings: {}, block_type: 'practice' }, error: null })
  api.then = (resolve: (r: { data: unknown; error: unknown }) => unknown) =>
    Promise.resolve(resolve({ data: writing ? null : [], error: null }))
  for (const op of ['update', 'insert', 'delete'] as const) {
    api[op] = () => {
      writing = true
      mocks.writes.push({ table, op })
      return api
    }
  }
  return api
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }))

import EditJourneyPage from './page'
import { updateBlockAction, setLeafAnchorAction, exportJourneyAction } from './actions'

/** Does the editor page let this caller in (no redirect to the player)? */
async function pageAdmits(): Promise<boolean> {
  try {
    await EditJourneyPage({ params: Promise.resolve({ slug: SLUG }) })
    return true
  } catch (e) {
    if (String((e as Error).message).startsWith('REDIRECT')) return false
    throw e
  }
}

/** Does a save land (a write reaches journey_plan_items, no refusal)? */
async function saveLands(): Promise<boolean> {
  mocks.writes.length = 0
  const res = await updateBlockAction(SLUG, 'item-1', { title: 'Morning sit' })
  return !('error' in res) && mocks.writes.some((w) => w.table === 'journey_plan_items' && w.op === 'update')
}

async function anchorLands(): Promise<boolean> {
  mocks.writes.length = 0
  const res = await setLeafAnchorAction(PLAN, 'item-1', true)
  return !('error' in res) && mocks.writes.length > 0
}

beforeEach(() => {
  mocks.redirect.mockClear()
  mocks.writes.length = 0
  mocks.caller = { id: 'profile-someone' }
  mocks.operator = false
  mocks.author = 'profile-author'
  mocks.spaceId = 'space-team'
  mocks.manager = false
})

describe('the Journey editor page and its save actions admit the same people (LIVE-732)', () => {
  it('a manager of the owning Space opens the editor AND every save lands', async () => {
    mocks.manager = true
    expect(await pageAdmits()).toBe(true)
    expect(await saveLands()).toBe(true)
    expect(await anchorLands()).toBe(true)
    expect('error' in (await exportJourneyAction(SLUG))).toBe(false)
  })

  it('the author still opens and saves', async () => {
    mocks.caller = { id: 'profile-author' }
    expect(await pageAdmits()).toBe(true)
    expect(await saveLands()).toBe(true)
    expect(await anchorLands()).toBe(true)
  })

  it('a platform operator still opens and saves', async () => {
    mocks.operator = true
    expect(await pageAdmits()).toBe(true)
    expect(await saveLands()).toBe(true)
    expect(await anchorLands()).toBe(true)
  })

  it('a Space member who does not manage it is refused by both, and nothing is written', async () => {
    expect(await pageAdmits()).toBe(false)
    expect(await saveLands()).toBe(false)
    expect(await anchorLands()).toBe(false)
    expect(mocks.writes).toEqual([])
  })

  it('a personal (root space) Journey has no Space managers: both refuse a non-author', async () => {
    mocks.spaceId = 'space-root'
    mocks.manager = true
    expect(await pageAdmits()).toBe(false)
    expect(await saveLands()).toBe(false)
    expect(await anchorLands()).toBe(false)
  })

  it('a signed-out caller is refused by both', async () => {
    mocks.caller = null
    expect(await pageAdmits()).toBe(false)
    expect(await saveLands()).toBe(false)
    expect(await anchorLands()).toBe(false)
  })
})
