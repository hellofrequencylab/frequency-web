import { describe, it, expect, vi, beforeEach } from 'vitest'

// The generic Spark (ADR-990). One runner now stands between every guided first draft and the
// model, so these lock the four things that must never drift when four hand-rolled preambles
// become one:
//   1. the DRIFT GUARD: every declared spark points at a registered Studio entity, quotes a real
//      budget key, and keeps the tier it was declared with,
//   2. the KILL SWITCH: AI off or over budget returns null and never reaches the model,
//   3. the MOOD dial still threads into the system prompt (the regression that was just fixed),
//   4. the raw model shape is never trusted.
// No network: the client, the completion chokepoint, and the usage ledger are all mocked.

const state = vi.hoisted(() => ({
  aiOn: true,
  overBudget: false,
  /** The params the last completeRaw call received, so the test can read the system prompt. */
  lastCall: null as null | Record<string, unknown>,
  /** What the fake model returns as its tool_use input. */
  toolInput: {} as unknown,
  /** Force a thrown call, to prove the runner degrades instead of propagating. */
  throwOnCall: false,
  /** Every ledger row the runner wrote. */
  ledger: [] as Record<string, unknown>[],
}))

vi.mock('./client', () => ({ aiEnabled: () => state.aiOn, getAnthropic: () => null }))

vi.mock('./usage', () => ({
  recordAiUsage: vi.fn(async (row: Record<string, unknown>) => {
    state.ledger.push(row)
  }),
  featureOverBudget: vi.fn(async () => state.overBudget),
}))

vi.mock('./complete', () => ({
  completeRaw: vi.fn(async (p: Record<string, unknown>) => {
    state.lastCall = p
    if (state.throwOnCall) throw new Error('model unavailable')
    const tools = p.tools as { name: string }[]
    return {
      tier: p.tier,
      model: 'test-model',
      content: [{ type: 'tool_use', id: 't1', name: tools[0].name, input: state.toolInput }],
      text: '',
      usage: { inputTokens: 10, outputTokens: 20 },
      costUsd: 0,
    }
  }),
}))

import { runSpark, defineSpark, sparkStr, sparkStrArray, sparkStrOrNull, sparkInt, sparkEnum } from './spark'
import { dailyCapFor, FEATURE_DAILY_CAP_USD } from './budget'
import { studioManifest } from '@/lib/studio/registry'
import { JOURNEY_SPARK } from './journey-spark'
import { PRACTICE_SPARK, PRACTICE_CLAIM } from './practice-spark'
import { CIRCLE_SPARK, CIRCLE_SUGGEST } from './circle-spark'
import { EVENT_SPARK, EVENT_POSTER_SCAN, EVENT_TEXT_ASSIST } from './events-ai'

/** Every declared spark in the app, with the tier and budget key it MUST keep. */
const DECLARED = [
  { name: 'JOURNEY_SPARK', spec: JOURNEY_SPARK, entity: 'journey', feature: 'journey-spark', tier: 'sonnet' },
  { name: 'PRACTICE_SPARK', spec: PRACTICE_SPARK, entity: 'practice', feature: 'practice-spark', tier: 'sonnet' },
  { name: 'PRACTICE_CLAIM', spec: PRACTICE_CLAIM, entity: 'practice', feature: 'practice-claim', tier: 'haiku' },
  { name: 'CIRCLE_SPARK', spec: CIRCLE_SPARK, entity: 'circle', feature: 'circle-spark', tier: 'sonnet' },
  { name: 'CIRCLE_SUGGEST', spec: CIRCLE_SUGGEST, entity: 'circle', feature: 'circle-create', tier: 'haiku' },
  { name: 'EVENT_SPARK', spec: EVENT_SPARK, entity: 'event', feature: 'event-spark', tier: 'sonnet' },
  { name: 'EVENT_POSTER_SCAN', spec: EVENT_POSTER_SCAN, entity: 'event', feature: 'event-poster-scan', tier: 'sonnet' },
  { name: 'EVENT_TEXT_ASSIST', spec: EVENT_TEXT_ASSIST, entity: 'event', feature: 'event-poster-scan', tier: 'haiku' },
] as const

beforeEach(() => {
  state.aiOn = true
  state.overBudget = false
  state.lastCall = null
  state.toolInput = {}
  state.throwOnCall = false
  state.ledger = []
  vi.clearAllMocks()
})

describe('the declared sparks (the drift guard)', () => {
  it.each(DECLARED)('$name keeps its entity, budget key, and tier', ({ spec, entity, feature, tier }) => {
    expect(spec.entity).toBe(entity)
    expect(spec.feature).toBe(feature)
    expect(spec.tier).toBe(tier)
  })

  it.each(DECLARED)('$name points at a REGISTERED Studio entity', ({ spec }) => {
    // An unregistered entity fails closed at runtime, which would kill the wizard silently.
    // Catching it here is the whole reason runSpark reads the catalog at all.
    expect(studioManifest(spec.entity)).not.toBeNull()
  })

  it.each(DECLARED)('$name runs under a positive daily cap', ({ spec }) => {
    expect(dailyCapFor(spec.feature)).toBeGreaterThan(0)
  })

  it('keeps every migrated budget key at its exact value', () => {
    // These are cost control, tuned per surface. Collapsing the modules must not collapse them.
    expect(FEATURE_DAILY_CAP_USD['journey-spark']).toBe(3)
    expect(FEATURE_DAILY_CAP_USD['practice-spark']).toBe(2)
    expect(FEATURE_DAILY_CAP_USD['practice-claim']).toBe(1)
    expect(FEATURE_DAILY_CAP_USD['circle-create']).toBe(1)
    expect(FEATURE_DAILY_CAP_USD['event-spark']).toBe(3)
    expect(FEATURE_DAILY_CAP_USD['event-poster-scan']).toBe(4)
  })

  it.each(DECLARED)('$name declares one tool and a total coercer', ({ spec }) => {
    expect(spec.tool.name.length).toBeGreaterThan(0)
    expect(typeof spec.coerce).toBe('function')
    // Garbage in must never throw out. The three event sparks answer garbage with an EMPTY
    // draft (coerceEventExtraction is total, so the editor opens on a blank form); the rest
    // answer null. Either way the surface has something to show.
    expect(() => spec.coerce(null, undefined as never)).not.toThrow()
  })

  it.each([JOURNEY_SPARK, PRACTICE_SPARK, PRACTICE_CLAIM, CIRCLE_SPARK, CIRCLE_SUGGEST])(
    'rejects an unusable shape rather than drafting from it',
    (spec) => {
      expect(spec.coerce(null, null as never)).toBeNull()
      expect(spec.coerce({ title: 42 }, null as never)).toBeNull()
    },
  )
})

// A tiny spark of our own, so the runner's behaviour is tested without any entity's prompt.
const TEST_SPARK = defineSpark<{ title: string }, number>({
  entity: 'journey',
  feature: 'journey-spark',
  tier: 'sonnet',
  maxTokens: 100,
  tool: { name: 'test_tool', description: 'test', input_schema: { type: 'object', properties: {} } },
  system: 'TASK RULES',
  coerce: (raw, max) => {
    const t = sparkStr((raw as Record<string, unknown> | null)?.title, max)
    return t ? { title: t } : null
  },
})

describe('runSpark: the kill switch and the budget cap', () => {
  it('returns null and never calls the model when AI is off', async () => {
    state.aiOn = false
    const { completeRaw } = await import('./complete')
    expect(await runSpark(TEST_SPARK, { content: 'hi', context: 80 })).toBeNull()
    expect(completeRaw).not.toHaveBeenCalled()
  })

  it('returns null and never calls the model when the feature is over budget', async () => {
    state.overBudget = true
    const { completeRaw } = await import('./complete')
    expect(await runSpark(TEST_SPARK, { content: 'hi', context: 80 })).toBeNull()
    expect(completeRaw).not.toHaveBeenCalled()
  })

  it('returns null for an entity the Studio catalog does not know', async () => {
    const { completeRaw } = await import('./complete')
    const orphan = { ...TEST_SPARK, entity: 'not-an-entity' }
    expect(await runSpark(orphan, { content: 'hi', context: 80 })).toBeNull()
    expect(completeRaw).not.toHaveBeenCalled()
  })

  it('returns null when the call throws, instead of propagating', async () => {
    state.throwOnCall = true
    expect(await runSpark(TEST_SPARK, { content: 'hi', context: 80 })).toBeNull()
  })
})

describe('runSpark: the mood dial still threads', () => {
  it('folds the mood tone directive into the system prompt', async () => {
    state.toolInput = { title: 'A steadier week' }
    await runSpark(TEST_SPARK, { content: 'hi', context: 80, mood: 'calm' })
    const system = String(state.lastCall?.system)
    // The mood steers TONE, below the voice primer and the task rules.
    expect(system).toContain('calm')
    expect(system).toContain('Calm and trustworthy')
    expect(system).toContain('TASK RULES')
  })

  it('leaves the prompt free of a tone directive when no mood is chosen', async () => {
    state.toolInput = { title: 'A steadier week' }
    await runSpark(TEST_SPARK, { content: 'hi', context: 80 })
    expect(String(state.lastCall?.system)).not.toContain('mood)')
  })

  it('ignores a mood for an entity whose manifest declares no dial', async () => {
    // `channel` is catalog-only: no accepts, no steer. A dial it does not have must not steer it.
    state.toolInput = { title: 'A steadier week' }
    await runSpark({ ...TEST_SPARK, entity: 'channel' }, { content: 'hi', context: 80, mood: 'bold' })
    expect(String(state.lastCall?.system)).not.toContain('Bold and energizing')
  })
})

describe('runSpark: the call it makes', () => {
  it('forces the declared tool, disables thinking, and records the ledger row', async () => {
    state.toolInput = { title: 'A steadier week' }
    const out = await runSpark(TEST_SPARK, { content: 'hi', context: 80, profileId: 'p1' })
    expect(out).toEqual({ title: 'A steadier week' })
    expect(state.lastCall?.tier).toBe('sonnet')
    expect(state.lastCall?.maxTokens).toBe(100)
    expect(state.lastCall?.thinking).toEqual({ type: 'disabled' })
    expect(state.lastCall?.toolChoice).toEqual({ type: 'tool', name: 'test_tool' })
    expect(state.ledger).toEqual([
      expect.objectContaining({ feature: 'journey-spark', profileId: 'p1' }),
    ])
  })

  it('lets one call raise the ceiling without changing the budget key', async () => {
    state.toolInput = { title: 'A steadier week' }
    await runSpark(TEST_SPARK, { content: 'hi', context: 80, maxTokens: 1200 })
    expect(state.lastCall?.maxTokens).toBe(1200)
    expect(state.ledger[0]?.feature).toBe('journey-spark')
  })

  it('evaluates a lazy system prompt per call', async () => {
    let n = 0
    const lazy = { ...TEST_SPARK, system: () => `CALL ${++n}` }
    state.toolInput = { title: 'x' }
    await runSpark(lazy, { content: 'hi', context: 80 })
    await runSpark(lazy, { content: 'hi', context: 80 })
    expect(String(state.lastCall?.system)).toContain('CALL 2')
  })

  it('passes content blocks through untouched, so a vision draft still works', async () => {
    state.toolInput = { title: 'x' }
    const content = [{ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/png' as const, data: 'AA' } }]
    await runSpark(TEST_SPARK, { content, context: 80 })
    expect(state.lastCall?.messages).toEqual([{ role: 'user', content }])
  })

  it('returns null when the model answers without the forced tool', async () => {
    const { completeRaw } = await import('./complete')
    vi.mocked(completeRaw).mockResolvedValueOnce({
      tier: 'sonnet',
      model: 'test-model',
      content: [{ type: 'text', text: 'sorry', citations: null }],
      text: 'sorry',
      usage: { inputTokens: 1, outputTokens: 1 },
      costUsd: 0,
    })
    expect(await runSpark(TEST_SPARK, { content: 'hi', context: 80 })).toBeNull()
  })

  it('returns null when the coercer rejects the shape (never trust the raw model)', async () => {
    state.toolInput = { title: 42, promise: '<script>' }
    expect(await runSpark(TEST_SPARK, { content: 'hi', context: 80 })).toBeNull()
  })
})

describe('the shared coercion helpers', () => {
  it('sparkStr trims, clamps, and rejects a non-string', () => {
    expect(sparkStr('  hello  ', 10)).toBe('hello')
    expect(sparkStr('abcdefghij', 4)).toBe('abcd')
    expect(sparkStr(7, 10)).toBe('')
    expect(sparkStr(null, 10)).toBe('')
  })

  it('sparkStrOrNull gives null for empty, so "only when stated" stays honest', () => {
    expect(sparkStrOrNull('   ', 10)).toBeNull()
    expect(sparkStrOrNull('ET', 10)).toBe('ET')
  })

  it('sparkStrArray keeps non-empty strings, clamped and capped', () => {
    expect(sparkStrArray(['  a ', '', 'bb', 3, 'ccc'], 2, 2)).toEqual(['a', 'bb'])
    expect(sparkStrArray('not an array', 5, 5)).toEqual([])
  })

  it('sparkInt floors and clamps into range, null for anything else', () => {
    expect(sparkInt(7.9, 1, 600)).toBe(7)
    expect(sparkInt(9000, 1, 600)).toBe(600)
    expect(sparkInt(0, 1, 600)).toBe(1)
    expect(sparkInt('12', 1, 600)).toBeNull()
    expect(sparkInt(Number.NaN, 1, 600)).toBeNull()
  })

  it('sparkEnum accepts only the real options, case-insensitively', () => {
    const allowed = ['gentle', 'standard', 'deep'] as const
    expect(sparkEnum('Deep', allowed)).toBe('deep')
    expect(sparkEnum('extreme', allowed)).toBeNull()
    expect(sparkEnum(null, allowed, 'standard')).toBe('standard')
  })
})
