import { beforeEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { emptyDraft } from '../create-space/builder'
const memory = vi.hoisted(() => ({ row: {} as Record<string, unknown>, collide: false, owners: [] as string[] }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: () => {
  let patch: Record<string, unknown> | null = null
  let revision: unknown
  let owner: unknown
  return {
    select() { return this },
    update(value: Record<string, unknown>) { patch = value; return this },
    eq(key: string, value: unknown) { if (key === 'owner_id') { owner = value; memory.owners.push(String(value)) } if (key === 'steps->>stepsRevision') revision = value; return this },
    is(key: string, value: unknown) { if (key === 'steps->>stepsRevision') revision = value; return this },
    async maybeSingle() {
      if (owner !== memory.row.owner_id) return { data: null, error: null }
      if (!patch) return { data: structuredClone(memory.row), error: null }
      const steps = memory.row.steps as Record<string, unknown>
      if (memory.collide) {
        memory.collide = false
        memory.row.steps = { ...steps, stepsRevision: 'concurrent-revision', offer: { status: 'published', ref: 'real-offer' } }
        return { data: null, error: null }
      }
      if ((steps.stepsRevision ?? null) !== revision) return { data: null, error: null }
      memory.row = { ...memory.row, ...patch }
      return { data: structuredClone(memory.row), error: null }
    },
  }
} }) }))
vi.mock('./shelf-io', () => ({ expireSources: vi.fn() }))
import { getActiveLaunch, getLaunchForOwner, saveWizardResume, markStepPublished, skipPhotoItem } from './store'
import { toSnapshot } from './state'
const resume = { version: 1, phase: 'builder', cursor: 2, theme: 'new-world', accentAt: 0, niche: null, goals: [], timedEntry: true, draft: null, leadToken: null }
beforeEach(() => {
  memory.row = { id: 'l', owner_id: 'owner', started_at: '2026-11-13T00:00:00Z', updated_at: '2026-11-13T00:00:00Z', steps: { spotlight: { status: 'published' } } }
  memory.collide = false
  memory.owners = []
})
describe('owner shared progress concurrency', () => {
  it('retries a same-millisecond conflict without losing newly published work', async () => {
    memory.collide = true
    const result = await saveWizardResume(toSnapshot(memory.row)!, resume)
    expect(result?.resume?.cursor).toBe(2)
    expect(result?.steps.offer?.ref).toBe('real-offer')
    expect(memory.owners.every((owner) => owner === 'owner')).toBe(true)
  })
  it('preserves newer resume metadata when a stale publisher or photo skipper writes', async () => {
    const stale = toSnapshot(memory.row)!
    await saveWizardResume(stale, resume)
    const published = await markStepPublished(stale, 'offer', 'offer-id')
    expect(published?.resume?.cursor).toBe(2)
    expect(await skipPhotoItem(stale, 'sc-logo')).toBe(true)
    const result = toSnapshot(memory.row)!
    expect(result.resume?.cursor).toBe(2)
    expect(result.steps.offer?.ref).toBe('offer-id')
    expect(result.skippedPhotos).toEqual(['sc-logo'])
  })
  it('cannot update a different owner record', async () => {
    expect(await saveWizardResume({ ...toSnapshot(memory.row)!, ownerId: 'stranger' }, resume)).toBeNull()
  })
})


describe('Node-safe metadata and full owner draft boundary', () => {
  it('loads state and pending under native Node without a bundler alias loader', () => {
    const output = execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', `
      import { toSnapshot } from './lib/launch/state.ts';
      import { parsePendingLaunch } from './lib/launch/pending.ts';
      const resume = { version: 1, phase: 'builder', cursor: 2, theme: 'new-world', accentAt: 0, niche: null, goals: [], timedEntry: true, draft: { privateUnvalidated: true }, leadToken: null };
      const at = '2026-11-13T00:00:00Z';
      const snapshot = toSnapshot({ id: 'l', owner_id: 'owner', started_at: at, updated_at: at, steps: { wizardResume: resume } });
      const pending = parsePendingLaunch(JSON.stringify({ resume, niche: null, intents: [], answers: {}, savedAt: at }), new Date(at));
      console.log(JSON.stringify({ cursor: snapshot.resume.cursor, draft: snapshot.resume.draft, heldDraft: pending.resume.draft }));
    `], { cwd: process.cwd(), encoding: 'utf8' })
    expect(JSON.parse(output)).toEqual({ cursor: 2, draft: null, heldDraft: null })
  })
  it('preserves fully validated private content through both JSON writers and owner reads', async () => {
    const stale = toSnapshot(memory.row)!
    const draft = { ...emptyDraft('new-world', true), name: 'Latest Space', offer: 'Current offering', cover: 's2', startedAt: '2026-11-01T00:00:00Z', leadToken: 'own-token-12345678' }
    await saveWizardResume(stale, { ...resume, draft, leadToken: draft.leadToken })
    expect((await getActiveLaunch('owner'))?.resume?.draft).toEqual(draft)
    const published = await markStepPublished(stale, 'offer', 'offer-id')
    expect(published?.resume?.draft).toEqual(draft)
    expect(await skipPhotoItem(stale, 'sc-logo')).toBe(true)
    const restored = await getLaunchForOwner('owner', 'l')
    expect(restored?.resume?.draft).toEqual(draft)
    expect(restored?.resume?.leadToken).toBe(draft.leadToken)
    expect(restored?.steps.offer?.ref).toBe('offer-id')
    expect(restored?.skippedPhotos).toEqual(['sc-logo'])
  })
  it('omits a resume entirely from owner reads when its full draft fails the canonical parser', async () => {
    memory.row.steps = { wizardResume: { ...resume, draft: { kit: 'not-a-preview-theme', name: 'Invalid draft' } } }
    expect(toSnapshot(memory.row)?.resume?.draft).toBeNull()
    expect((await getActiveLaunch('owner'))?.resume).toBeUndefined()
    expect((await getLaunchForOwner('owner', 'l'))?.resume).toBeUndefined()
  })
})
