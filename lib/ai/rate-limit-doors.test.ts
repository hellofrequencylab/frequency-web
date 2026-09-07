import { describe, it, expect, vi, beforeEach } from 'vitest'

// LIVE-195 — the DOORS, driven end to end with the limiter saying no.
//
// The ratchet in rate-limit.test.ts proves every door CALLS the limiter. These prove what a
// throttled member actually gets: the door's own existing refusal (a deterministic fallback, a
// pending verdict, a deflected help answer), and NO model call. A gate that refuses but bills
// anyway would pass a shape check and fail the only thing that matters.

const state = vi.hoisted(() => ({ allow: true, modelCalls: 0 }))

vi.mock('@/lib/rate-limit', () => ({
  rateLimitOk: vi.fn(async () => state.allow),
}))

vi.mock('./client', () => ({ aiEnabled: () => true, getAnthropic: () => null }))

vi.mock('./usage', () => ({
  aiAvailable: vi.fn(async () => true),
  featureOverBudget: vi.fn(async () => false),
  recordAiUsage: vi.fn(async () => {}),
  logHelpQuery: vi.fn(async () => {}),
}))

vi.mock('./complete', () => ({
  AiUnavailableError: class AiUnavailableError extends Error {},
  completeRaw: vi.fn(async (p: Record<string, unknown>) => {
    state.modelCalls += 1
    const tools = (p.tools ?? []) as { name: string }[]
    return {
      tier: p.tier,
      model: 'test-model',
      content: tools.length ? [{ type: 'tool_use', id: 't1', name: tools[0].name, input: {} }] : [],
      text: 'model said something',
      usage: { inputTokens: 1, outputTokens: 1 },
      costUsd: 0,
    }
  }),
  completeText: vi.fn(async () => {
    state.modelCalls += 1
    return { text: 'model said something', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0, tier: 'haiku' }
  }),
  runToolLoop: vi.fn(async () => {
    state.modelCalls += 1
    return { text: 'model said something', toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, tier: 'haiku', rounds: 1 }
  }),
}))

vi.mock('./vera/usage-gate', () => ({ veraDailyCapReached: vi.fn(async () => false) }))
vi.mock('./vera/config', () => ({
  getVeraConfig: vi.fn(async () => ({
    styleNote: '',
    register: 'cool' as const,
    tier: 'haiku' as const,
    maxReplyChars: 320,
    greeting: 'Hey.',
    induction: { introHeading: '', introBody: '', heardAbout: [] },
  })),
}))

// Retrieval for the help RAG: one strong chunk, so an unthrottled ask really answers and the
// throttled one is refused by the limiter rather than by an empty index.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: vi.fn(async () => ({
      data: [{ category: 'getting-started', slug: 'join-a-circle', heading: 'Join', content: 'Tap join.', similarity: 0.9 }],
    })),
  }),
}))

vi.mock('./embed', () => ({ embedText: vi.fn(async () => [0.1]) }))
vi.mock('next/server', () => ({ after: (fn: () => void) => { void fn } }))

import { runSpark, defineSpark } from './spark'
import { runQualityGate, qualityStandardFor } from './quality-gate'
import { runVeraClaudeTurn } from './vera/agent-claude'
import { draftSpaceBio, fallbackBio, type SpaceContext } from './space-copilot'
import { answerHelpQuestion } from './help-rag'

const SPARK = defineSpark<{ ok: boolean }>({
  entity: 'journey',
  feature: 'journey-spark',
  tier: 'sonnet',
  maxTokens: 100,
  tool: { name: 'draft', description: 'draft', input_schema: { type: 'object', properties: {} } },
  system: 'draft it',
  coerce: () => ({ ok: true }),
})

const SPACE: SpaceContext = {
  name: 'Still Point',
  type: 'business',
  brandName: 'Still Point',
  about: 'breathwork and rest sessions',
  profileId: 'p1',
  spaceId: 's1',
}

beforeEach(() => {
  state.allow = true
  state.modelCalls = 0
})

describe('Vera chat (lib/ai/vera/agent-claude.ts)', () => {
  it('runs the turn while the member is inside the window', async () => {
    const res = await runVeraClaudeTurn({ history: [], memberText: 'hi', profileId: 'p1' })
    expect(res).not.toBeNull()
    expect(state.modelCalls).toBe(1)
  })

  it('degrades to the deterministic concierge (null) once the member is over it, without billing', async () => {
    state.allow = false
    const res = await runVeraClaudeTurn({ history: [], memberText: 'hi', profileId: 'p1' })
    expect(res).toBeNull()
    expect(state.modelCalls).toBe(0)
  })
})

describe('every Spark (lib/ai/spark.ts)', () => {
  it('drafts while the author is inside the window', async () => {
    expect(await runSpark(SPARK, { content: 'a few answers', profileId: 'p1' })).toEqual({ ok: true })
    expect(state.modelCalls).toBe(1)
  })

  it('falls back to hand entry (null) once the author is over it, without billing', async () => {
    state.allow = false
    expect(await runSpark(SPARK, { content: 'a few answers', profileId: 'p1' })).toBeNull()
    expect(state.modelCalls).toBe(0)
  })
})

describe('the pre-publish quality read (lib/ai/quality-gate.ts)', () => {
  const standard = qualityStandardFor('journey', 'Journey')

  it('returns a fail-closed pending verdict once the author is over the window, without billing', async () => {
    state.allow = false
    const verdict = await runQualityGate(standard, 'a long enough draft to review, honestly', { actorId: 'p1' })
    expect(verdict.status).toBe('pending')
    expect(state.modelCalls).toBe(0)
  })
})

describe('the Space copilot (lib/ai/space-copilot.ts)', () => {
  it('drafts while the owner is inside the window', async () => {
    const bio = await draftSpaceBio(SPACE)
    expect(bio).toBe('model said something')
    expect(state.modelCalls).toBe(1)
  })

  it('falls back to the deterministic bio once the owner is over it, without billing', async () => {
    state.allow = false
    expect(await draftSpaceBio(SPACE)).toBe(fallbackBio(SPACE))
    expect(state.modelCalls).toBe(0)
  })
})

describe('grounded help (lib/ai/help-rag.ts)', () => {
  it('answers while the asker is inside the window', async () => {
    const res = await answerHelpQuestion('how do I join a circle', 'p1')
    expect(res.deflected).toBe(false)
    expect(res.answer).toBe('model said something')
    expect(state.modelCalls).toBe(1)
  })

  it('deflects to a human once the asker is over the window, without billing', async () => {
    state.allow = false
    const res = await answerHelpQuestion('how do I join a circle', 'p1')
    expect(res.deflected).toBe(true)
    expect(res.answer).toBeNull()
    expect(state.modelCalls).toBe(0)
  })
})
