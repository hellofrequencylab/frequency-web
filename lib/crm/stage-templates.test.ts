import { describe, it, expect } from 'vitest'
import { seedStagesForSpace, genericStages } from './stage-templates'
import { resolveMode } from '@/lib/spaces/modes'
import type { SpaceType } from '@/lib/spaces/types'

// CRM STARTING-PIPELINE SEED (CRM-STRATEGY §7, P3 · unified with Space Modes by ADR-517 Phase F E1). The
// seed now comes from the resolved MODE PRESET's pipeline, the SAME set the Mode settings "Suggested
// pipeline" preview shows, so this suite locks the "preview == seed" guarantee and the generic fallback.
// PURE + total, so it is network-free.

describe('seedStagesForSpace', () => {
  it('seeds EXACTLY the resolved Mode preset pipeline (so the preview and the seed can never disagree)', () => {
    const cases: ReadonlyArray<{ type: SpaceType; variant?: string | null }> = [
      { type: 'business', variant: 'service' },
      { type: 'business', variant: 'product' },
      { type: 'business', variant: 'packages' },
      { type: 'business', variant: 'appointments' },
      { type: 'business', variant: 'ticketed' },
      { type: 'nonprofit', variant: 'donations' },
      { type: 'business', variant: null }, // null → the type's default Focus
    ]
    for (const { type, variant } of cases) {
      const mode = resolveMode(type, variant ?? null)
      expect(mode).not.toBeNull()
      const preview = mode!.pipeline.map((s) => ({ name: s.name, kind: s.kind }))
      expect(seedStagesForSpace(type, variant)).toEqual(preview)
    }
  })

  it('an unknown variant resolves to the type default Focus (matches resolveMode fallback)', () => {
    const fallback = resolveMode('business', null)!.pipeline.map((s) => ({ name: s.name, kind: s.kind }))
    expect(seedStagesForSpace('business', 'not-a-real-focus')).toEqual(fallback)
  })

  it('a type with NO Mode preset (root / null / undefined) falls back to the generic funnel', () => {
    const generic = ['New', 'Active', 'Won', 'Lost']
    expect(seedStagesForSpace('root').map((s) => s.name)).toEqual(generic)
    expect(seedStagesForSpace(null).map((s) => s.name)).toEqual(generic)
    expect(seedStagesForSpace(undefined).map((s) => s.name)).toEqual(generic)
  })

  it('every seeded pipeline is a non-empty, ordered funnel: open start, at least one won and one lost', () => {
    for (const t of ['business', 'nonprofit', 'root'] as SpaceType[]) {
      const stages = seedStagesForSpace(t)
      expect(stages.length).toBeGreaterThan(0)
      expect(stages[0]!.kind).toBe('open')
      expect(stages.filter((s) => s.kind === 'won').length).toBeGreaterThanOrEqual(1)
      expect(stages.filter((s) => s.kind === 'lost').length).toBeGreaterThanOrEqual(1)
    }
  })

  it('returns a fresh array each call (a caller can number/mutate it without poisoning the source)', () => {
    const a = seedStagesForSpace('business')
    a.push({ name: 'Tampered', kind: 'open' })
    const b = seedStagesForSpace('business')
    expect(b.some((s) => s.name === 'Tampered')).toBe(false)
  })
})

describe('genericStages', () => {
  it('is the plain open -> won/lost fallback, fresh each call', () => {
    expect(genericStages().map((s) => s.name)).toEqual(['New', 'Active', 'Won', 'Lost'])
    const a = genericStages()
    a[0]!.name = 'Changed'
    expect(genericStages()[0]!.name).toBe('New')
  })
})
