import { describe, it, expect, vi, beforeEach } from 'vitest'

// Phase 1 (ENTITY-SPACES) — the Vera co-host SEAM. Two invariants must hold WITHOUT any
// network: the deterministic fallback returns sensible, grounded copy (so the affordance
// always works when AI is off / over budget / fails), and NOTHING the seam emits carries an
// em dash (the voice canon forbids the long dash — docs/CONTENT-VOICE.md). In the test env no
// ANTHROPIC_API_KEY / gateway is set, so aiEnabled() is false and the async drafters take the
// deterministic path — letting us assert the public API end-to-end with no client.

import {
  stripEmDashes,
  fallbackBio,
  fallbackOfferingBlurb,
  fallbackTagline,
  draftSpaceBio,
  draftOfferingBlurb,
  suggestTagline,
  type SpaceContext,
} from './space-copilot'

const PRACTITIONER: SpaceContext = {
  name: 'Still Point',
  type: 'business',
  brandName: 'Still Point',
  about: 'breathwork and rest sessions for people who sit at a desk all day',
}

const noEmDash = (s: string) => expect(s).not.toMatch(/[—–]/)

describe('stripEmDashes (the no-long-dash guard)', () => {
  it('replaces a spaced em dash with a comma', () => {
    expect(stripEmDashes('warm, plain copy — never salesy')).toBe('warm, plain copy, never salesy')
  })

  it('collapses a tight em/en dash (a range) to a hyphen', () => {
    expect(stripEmDashes('open 9–5 daily')).toBe('open 9-5 daily')
  })

  it('strips surrounding quotes the model sometimes adds', () => {
    expect(stripEmDashes('"A place to land"')).toBe('A place to land')
  })

  it('leaves clean copy untouched and never leaves a long dash', () => {
    const out = stripEmDashes('Coaching that meets you where you are')
    expect(out).toBe('Coaching that meets you where you are')
    noEmDash(out)
  })
})

describe('deterministic fallbacks (AI off → still useful copy)', () => {
  it('fallbackBio grounds in the brand, type, and the owner words', () => {
    const bio = fallbackBio(PRACTITIONER)
    expect(bio).toContain('Still Point')
    expect(bio).toContain('business')
    expect(bio).toContain('breathwork')
    expect(bio.length).toBeGreaterThan(20)
    noEmDash(bio)
  })

  it('fallbackBio works with a thin Space (no about)', () => {
    const bio = fallbackBio({ name: 'Acme', type: 'business' })
    expect(bio).toContain('Acme')
    expect(bio).toContain('business')
    noEmDash(bio)
  })

  it('fallbackBio degrades to a neutral noun when nothing is known', () => {
    const bio = fallbackBio({})
    expect(bio).toContain('this space')
    noEmDash(bio)
  })

  it('fallbackOfferingBlurb prefers the owner details, else the title, else the brand', () => {
    expect(fallbackOfferingBlurb(PRACTITIONER, { text: 'a 30 minute reset' })).toContain('30 minute reset')
    expect(fallbackOfferingBlurb(PRACTITIONER, { title: 'Reset Session' })).toContain('Reset Session')
    const bare = fallbackOfferingBlurb(PRACTITIONER, {})
    expect(bare).toContain('Still Point')
    ;[
      fallbackOfferingBlurb(PRACTITIONER, { text: 'a 30 minute reset — by appointment' }),
      fallbackOfferingBlurb(PRACTITIONER, { title: 'Reset Session' }),
      bare,
    ].forEach(noEmDash)
  })

  it('fallbackTagline is short, plain, and type-aware', () => {
    const tag = fallbackTagline({ type: 'business' })
    expect(tag.length).toBeGreaterThan(0)
    expect(tag.length).toBeLessThanOrEqual(80)
    expect(tag).not.toMatch(/\.$/) // no trailing period on a tagline
    noEmDash(tag)
    noEmDash(fallbackTagline({ type: 'nonprofit' }))
    noEmDash(fallbackTagline({ type: 'root' }))
    noEmDash(fallbackTagline({}))
  })
})

describe('public drafters fall back deterministically when AI is off (no network)', () => {
  it('draftSpaceBio returns the grounded fallback', async () => {
    const bio = await draftSpaceBio(PRACTITIONER)
    expect(bio).toBe(fallbackBio(PRACTITIONER))
    noEmDash(bio)
  })

  it('draftOfferingBlurb returns the grounded fallback', async () => {
    const offering = { title: 'Reset Session', text: 'a 30 minute breathing reset' }
    const blurb = await draftOfferingBlurb(PRACTITIONER, offering)
    expect(blurb).toBe(fallbackOfferingBlurb(PRACTITIONER, offering))
    noEmDash(blurb)
  })

  it('suggestTagline returns a short single line with no trailing period or long dash', async () => {
    const tag = await suggestTagline(PRACTITIONER)
    expect(tag.split('\n')).toHaveLength(1)
    expect(tag.length).toBeLessThanOrEqual(80)
    expect(tag).not.toMatch(/\.$/)
    noEmDash(tag)
  })

  it('never throws on an empty Space', async () => {
    await expect(draftSpaceBio({})).resolves.toBeTypeOf('string')
    await expect(draftOfferingBlurb({}, {})).resolves.toBeTypeOf('string')
    await expect(suggestTagline({})).resolves.toBeTypeOf('string')
  })
})

// Per-Space cost attribution (no network): with AI mocked ON and the ledger + completion
// stubbed at the module boundary, a draft must record its usage tagged with the Space's id, so
// spend is attributable and the per-Space cap has something to sum. Mocks keep this offline.
describe('spaceId flows into the cost ledger (no network)', () => {
  const inserts: Array<Record<string, unknown>> = []

  beforeEach(() => {
    vi.resetModules()
    inserts.length = 0
  })

  it('records space_id when a Space is drafted with AI on', async () => {
    // AI on, but every call is stubbed: aiEnabled() true; the completion returns fixed text +
    // usage; the admin client captures inserts and reports an empty (under-budget) ledger.
    vi.doMock('./client', () => ({ aiEnabled: () => true, getAnthropic: () => ({}) }))
    vi.doMock('./complete', async (orig) => {
      const actual = await (orig() as Promise<typeof import('./complete')>)
      return {
        ...actual,
        completeText: vi.fn(async () => ({
          text: 'A grounded About for this space.',
          usage: { inputTokens: 10, outputTokens: 20 },
          costUsd: 0.0001,
          tier: 'haiku' as const,
        })),
      }
    })
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: () => ({
        from: () => ({
          insert: (row: Record<string, unknown>) => {
            inserts.push(row)
            return Promise.resolve({ error: null })
          },
          // featureOverBudget's chained query: select().eq().gte()[.eq()] resolves to no rows.
          select: () => ({
            eq: () => ({
              gte: () => {
                const p = Promise.resolve({ data: [] as { cost_usd: number }[] })
                return Object.assign(p, { eq: () => p })
              },
            }),
          }),
        }),
      }),
    }))

    const { draftSpaceBio: drafter } = await import('./space-copilot')
    const out = await drafter({
      spaceId: 'space-123',
      name: 'Still Point',
      type: 'business',
      profileId: 'profile-9',
    })

    expect(out).toBe('A grounded About for this space.')
    const usageRow = inserts.find((r) => 'space_id' in r && 'feature' in r)
    expect(usageRow).toBeDefined()
    expect(usageRow?.space_id).toBe('space-123')
    expect(usageRow?.feature).toBe('space-copilot')
    expect(usageRow?.profile_id).toBe('profile-9')
  })
})
