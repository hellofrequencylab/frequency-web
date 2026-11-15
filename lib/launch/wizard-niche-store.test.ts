import { beforeEach, expect, it, vi } from 'vitest'
import { emptyDraft } from '@/lib/create-space/builder'
const memory = vi.hoisted(() => ({ row: {} as Record<string, unknown>, collision: null as 'revision' | 'attach' | null, writes: [] as Array<{ patch: Record<string, unknown>; filters: Record<string, unknown> }> }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: () => {
  let patch: Record<string, unknown> | null = null
  const filters: Record<string, unknown> = {}
  return {
    select() { return this },
    update(value: Record<string, unknown>) { patch = value; return this },
    eq(key: string, value: unknown) { filters[key] = value; return this },
    is(key: string, value: unknown) { filters[key] = value; return this },
    async maybeSingle() {
      const matches = () => Object.entries(filters).every(([key, value]) => (key === 'steps->>stepsRevision' ? (memory.row.steps as Record<string, unknown>).stepsRevision ?? null : memory.row[key] ?? null) === value)
      if (!patch) return { data: matches() ? structuredClone(memory.row) : null, error: null }
      memory.writes.push({ patch, filters: { ...filters } })
      if (memory.collision === 'revision') {
        memory.collision = null
        memory.row.steps = { ...(memory.row.steps as object), stepsRevision: 'fresh-revision', offer: { status: 'published', ref: 'existing-offer' } }
        return { data: null, error: null }
      }
      if (memory.collision === 'attach') {
        memory.collision = null
        memory.row.space_id = 'attached-space'
        return { data: null, error: null }
      }
      if (!matches()) return { data: null, error: null }
      memory.row = { ...memory.row, ...patch }
      return { data: structuredClone(memory.row), error: null }
    },
  }
} }) }))
vi.mock('./shelf-io', () => ({ expireSources: vi.fn() }))
import { saveWizardResume } from './store'
import { toSnapshot } from './state'
const draft = { ...emptyDraft('new-world', true), niche: 'faith' as const, modeHint: 'nonprofit:donations', goals: ['donations'] as ['donations'] }
const input = () => ({ version: 1, phase: 'builder', cursor: 1, theme: 'new-world', accentAt: 0, niche: 'coaches', goals: ['bookings'], modeHint: draft.modeHint, timedEntry: false, draft, leadToken: null })
beforeEach(() => { memory.row = { id: 'launch', owner_id: 'owner', space_id: null, niche: 'studios', intents: ['classes'], started_at: '2026-11-14T12:00:00Z', updated_at: '2026-11-14T12:00:00Z', steps: {} }; memory.collision = null; memory.writes = [] })
it('writes validated draft niche/intents and resume atomically under the same owner CAS', async () => {
  const result = await saveWizardResume(toSnapshot(memory.row)!, input())
  expect(result).toMatchObject({ niche: 'faith', intents: ['donations'], resume: expect.objectContaining({ niche: 'faith', goals: ['donations'] }) })
  expect(memory.writes).toHaveLength(1)
  expect(memory.writes[0].patch).toMatchObject({ niche: 'faith', intents: ['donations'], steps: expect.objectContaining({ wizardResume: expect.objectContaining({ niche: 'faith', goals: ['donations'] }) }) })
  expect(memory.writes[0].filters).toMatchObject({ owner_id: 'owner', space_id: null, 'steps->>stepsRevision': null })
})
it('retries against fresh published work and never loses it while updating the niche', async () => {
  memory.collision = 'revision'
  const result = await saveWizardResume(toSnapshot(memory.row)!, input())
  expect(result?.steps.offer?.ref).toBe('existing-offer')
  expect(result?.niche).toBe('faith')
  expect(memory.writes).toHaveLength(2)
  expect(memory.writes[1].filters['steps->>stepsRevision']).toBe('fresh-revision')
})
it('refuses a retry after a concurrent Space attachment without overwriting its niche', async () => {
  memory.collision = 'attach'
  expect(await saveWizardResume(toSnapshot(memory.row)!, input())).toBeNull()
  expect(memory.row.niche).toBe('studios')
  expect(memory.writes).toHaveLength(1)
})
it('does not let metadata-only or launch-phase writes replace canonical niche/intents', async () => {
  await saveWizardResume(toSnapshot(memory.row)!, { ...input(), draft: null })
  expect(memory.row.niche).toBe('studios')
  expect(memory.writes[0].patch).not.toHaveProperty('niche')
  await saveWizardResume(toSnapshot(memory.row)!, { ...input(), phase: 'launch' })
  expect(memory.row.niche).toBe('studios')
  expect(memory.writes[1].patch).not.toHaveProperty('niche')
})
