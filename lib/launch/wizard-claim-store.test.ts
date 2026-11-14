import { beforeEach, describe, expect, it, vi } from 'vitest'
const memory = vi.hoisted(() => ({ row: {} as Record<string, unknown>, collision: null as null | 'attach' | 'resume' | 'updated' | 'handover', filters: [] as Array<[string, unknown]>, writes: 0 }))
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
      if (memory.collision === 'attach') memory.row.space_id = 'newly-attached-space'
      if (memory.collision === 'resume') {
        const steps = memory.row.steps as Record<string, unknown>
        memory.row.steps = { ...steps, wizardResume: { ...(steps.wizardResume as Record<string, unknown>), cursor: 3 }, stepsRevision: 'concurrent-resume' }
        memory.row.updated_at = '2026-11-13T12:00:00Z'
      }
      if (memory.collision === 'handover') {
        const steps = memory.row.steps as Record<string, unknown>
        memory.row.steps = { ...steps, wizardResume: { ...(steps.wizardResume as Record<string, unknown>), phase: 'launch' }, stepsRevision: 'handover-revision' }
      }
      if (memory.collision === 'updated') memory.row.updated_at = '2026-11-13T10:01:00Z'
      memory.collision = null
      if (filters.some(([key, value]) => valueOf(key) !== value)) return { data: null, error: null }
      memory.row = { ...memory.row, ...patch }
      return { data: structuredClone(memory.row), error: null }
    },
  }
} }) }))
vi.mock('./shelf-io', () => ({ expireSources: vi.fn() }))
import { saveWizardResume } from './store'
import { toSnapshot } from './state'
const resume = { version: 1, phase: 'builder', cursor: 2, theme: 'new-world', accentAt: 0, niche: null, goals: [], timedEntry: true, draft: null, leadToken: null }
const held = { heldSavedAt: '2026-11-13T11:00:00Z' }
const now = new Date('2026-11-13T11:01:00Z')
beforeEach(() => {
  memory.row = { id: 'launch', owner_id: 'owner', space_id: null, started_at: '2026-11-01T12:00:00Z', updated_at: '2026-11-13T10:00:00Z', steps: { spotlight: { status: 'published', ref: 'preserved' }, wizardResume: { ...resume, cursor: 1 }, stepsRevision: 'old-revision' } }
  memory.filters = []; memory.writes = 0; memory.collision = null
})
describe('claim-specific fresh-row CAS guards', () => {
  it('refuses a newer canonical resume appearing after the route read', async () => {
    const stale = toSnapshot(memory.row)!
    memory.row.updated_at = '2026-11-13T12:00:00Z'
    expect(await saveWizardResume(stale, resume, now, held)).toBeNull()
    expect(memory.writes).toBe(0)
  })
  it('detects a same-timestamp Space attachment outside the steps revision', async () => {
    const stale = toSnapshot(memory.row)!
    memory.collision = 'attach'
    expect(await saveWizardResume(stale, resume, now, held)).toBeNull()
    expect(memory.row.space_id).toBe('newly-attached-space')
    expect((memory.row.steps as Record<string, unknown>).stepsRevision).toBe('old-revision')
    expect(memory.filters).toContainEqual(['space_id', null])
    expect(memory.filters).toContainEqual(['updated_at', '2026-11-13T10:00:00Z'])
  })
  it('rechecks freshness instead of overwriting a newer resume after a CAS collision', async () => {
    memory.collision = 'resume'
    expect(await saveWizardResume(toSnapshot(memory.row)!, resume, now, held)).toBeNull()
    expect((memory.row.steps as Record<string, Record<string, unknown>>).wizardResume.cursor).toBe(3)
    expect(memory.writes).toBe(1)
  })
  it('retries an older non-steps update without losing published work or start time', async () => {
    memory.collision = 'updated'
    const saved = await saveWizardResume(toSnapshot(memory.row)!, resume, now, held)
    expect(saved?.resume?.cursor).toBe(2)
    expect(saved?.steps.spotlight?.ref).toBe('preserved')
    expect(saved?.startedAt).toBe('2026-11-01T12:00:00Z')
    expect(memory.writes).toBe(2)
    expect(memory.filters.some(([key]) => key.includes('wizardResume'))).toBe(false)
  })
  it('allows an initial canonical resume even if creating its empty row is newer than the hold', async () => {
    memory.row.updated_at = '2026-11-13T12:00:00Z'
    memory.row.steps = { spotlight: { status: 'published', ref: 'preserved' } }
    const saved = await saveWizardResume(toSnapshot(memory.row)!, resume, now, held)
    expect(saved?.resume?.cursor).toBe(2)
    expect(saved?.steps.spotlight?.ref).toBe('preserved')
  })
  it('does not rewind a launch hand-over when an earlier builder autosave retries', async () => {
    memory.collision = 'handover'
    expect(await saveWizardResume(toSnapshot(memory.row)!, resume, now)).toBeNull()
    expect((memory.row.steps as Record<string, Record<string, unknown>>).wizardResume.phase).toBe('launch')
    expect(memory.writes).toBe(1)
  })
  it('rejects builder progress once a Space is attached', async () => {
    memory.row.space_id = 'existing-space'
    expect(await saveWizardResume(toSnapshot(memory.row)!, resume, now)).toBeNull()
    expect(memory.writes).toBe(0)
  })
  it('does not race a non-JSON Space attachment during an ordinary builder save', async () => {
    memory.collision = 'attach'
    expect(await saveWizardResume(toSnapshot(memory.row)!, resume, now)).toBeNull()
    expect(memory.row.space_id).toBe('newly-attached-space')
    expect((memory.row.steps as Record<string, Record<string, unknown>>).wizardResume.cursor).toBe(1)
  })
  it('keeps ordinary progress writes independent of claim timestamp preconditions', async () => {
    const saved = await saveWizardResume(toSnapshot(memory.row)!, resume, now)
    expect(saved?.resume?.cursor).toBe(2)
    expect(memory.filters.some(([key]) => key === 'updated_at')).toBe(false)
    expect(memory.filters).toContainEqual(['space_id', null])
  })
})
