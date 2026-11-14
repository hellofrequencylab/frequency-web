import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyDraft, serializeDraft } from '../create-space/builder'
const memory = vi.hoisted(() => ({ row: {} as Record<string, unknown>, attach: null as null | 'before-save' | 'during-update', writes: 0, filters: [] as Array<[string, unknown]>, holds: 0, held: null as unknown }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/app/sign-in/actions', () => ({ signInWithGoogle: vi.fn(), sendSignupLink: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => 'session-owner' }))
vi.mock('@/lib/launch/enabled', () => ({ launchSystemEnabled: () => true }))
vi.mock('@/lib/launch/pending-io', () => ({ readPendingLaunch: async () => null, writePendingLaunch: async (held: unknown) => {
  memory.holds++; memory.held = held
  if (memory.attach === 'before-save') memory.row.space_id = 'concurrently-attached-space'
} }))
vi.mock('@/lib/create-space/draft-io', () => ({ readDraftByToken: vi.fn(), saveDraft: vi.fn() }))
vi.mock('@/lib/spaces/store', () => ({ isSpaceSlugTaken: async () => false }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: async () => true }))
vi.mock('./shelf-io', () => ({ expireSources: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: () => {
  let patch: Record<string, unknown> | null = null
  const filters: Array<[string, unknown]> = []
  const valueOf = (key: string) => key === 'steps->>stepsRevision' ? (memory.row.steps as Record<string, unknown>).stepsRevision ?? null : memory.row[key] ?? null
  return {
    select() { return this },
    update(value: Record<string, unknown>) { patch = value; return this },
    eq(key: string, value: unknown) { filters.push([key, value]); if (patch) memory.filters.push([key, value]); return this },
    is(key: string, value: unknown) { filters.push([key, value]); if (patch) memory.filters.push([key, value]); return this },
    async maybeSingle() {
      if (!patch) return { data: structuredClone(memory.row), error: null }
      memory.writes++
      if (memory.attach === 'during-update') { memory.row.space_id = 'concurrently-attached-space'; memory.attach = null }
      if (filters.some(([key, value]) => valueOf(key) !== value)) return { data: null, error: null }
      memory.row = { ...memory.row, ...patch }
      return { data: structuredClone(memory.row), error: null }
    },
  }
} }) }))
import { continueSignedIn } from '@/app/(marketing)/create-a-space/actions'
const draft = { ...emptyDraft('new-world', true), name: 'Latest browser draft', leadToken: 'handover-token-12345', startedAt: '2026-11-01T12:00:00Z' }
const form = () => { const f = new FormData(); f.set('draft', serializeDraft(draft)); return f }
beforeEach(() => {
  memory.row = { id: 'launch', owner_id: 'session-owner', space_id: null, started_at: '2026-11-01T12:00:00Z', updated_at: '2026-11-13T10:00:00Z', steps: { spotlight: { status: 'published', ref: 'preserved' }, stepsRevision: 'original-revision' } }
  memory.attach = null; memory.writes = 0; memory.filters = []; memory.holds = 0; memory.held = null
})
describe('signed-in handover through the real owner store', () => {
  it('rejects a Space attachment occurring after the action reads its active launch', async () => {
    memory.attach = 'before-save'
    expect(await continueSignedIn(form())).toMatchObject({ ok: false })
    expect(memory.writes).toBe(0)
    expect(memory.holds).toBe(1)
    expect(memory.held).toMatchObject({ resume: { leadToken: 'handover-token-12345' } })
    expect((memory.row.steps as Record<string, unknown>).wizardResume).toBeUndefined()
  })
  it('atomically rejects a same-timestamp attachment between fresh read and SQL update', async () => {
    memory.attach = 'during-update'
    expect(await continueSignedIn(form())).toMatchObject({ ok: false })
    expect(memory.filters).toContainEqual(['space_id', null])
    expect(memory.row.space_id).toBe('concurrently-attached-space')
    expect((memory.row.steps as Record<string, unknown>).stepsRevision).toBe('original-revision')
    expect((memory.row.steps as Record<string, unknown>).wizardResume).toBeUndefined()
    expect(memory.holds).toBe(1)
    expect(memory.held).toMatchObject({ resume: { leadToken: 'handover-token-12345' } })
  })
  it('saves a complete unattached handover without losing existing published metadata', async () => {
    expect(await continueSignedIn(form())).toMatchObject({ ok: true })
    expect((memory.row.steps as Record<string, Record<string, unknown>>).wizardResume).toMatchObject({ phase: 'launch', draft: { name: 'Latest browser draft', leadToken: 'handover-token-12345', startedAt: '2026-11-01T12:00:00Z' } })
    expect((memory.row.steps as Record<string, Record<string, unknown>>).spotlight.ref).toBe('preserved')
    expect(memory.filters).toContainEqual(['owner_id', 'session-owner'])
    expect(memory.filters).toContainEqual(['space_id', null])
  })
})
