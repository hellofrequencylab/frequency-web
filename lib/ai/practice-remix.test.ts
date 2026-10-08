import { describe, it, expect, vi, beforeEach } from 'vitest'

// LIVE-645: Vera's "Remix it" directions for a practice. No network: the client, the completion
// chokepoint, the usage ledger and the limiter are mocked, so these pin the contract the dialog
// leans on: its own budget key on Haiku, the voice + practice-shape primers, a coercer that never
// trusts the model, and null (the plain copy) whenever the model is not available.

const state = vi.hoisted(() => ({
  aiOn: true,
  overBudget: false,
  lastCall: null as null | Record<string, unknown>,
  toolInput: {} as unknown,
  ledger: [] as Record<string, unknown>[],
}))

vi.mock('./client', () => ({ aiEnabled: () => state.aiOn, getAnthropic: () => null }))
vi.mock('./rate-limit', () => ({ aiRateLimited: vi.fn(async () => false) }))
vi.mock('./usage', () => ({
  recordAiUsage: vi.fn(async (row: Record<string, unknown>) => {
    state.ledger.push(row)
  }),
  featureOverBudget: vi.fn(async () => state.overBudget),
}))
vi.mock('./complete', () => ({
  completeRaw: vi.fn(async (p: Record<string, unknown>) => {
    state.lastCall = p
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

import {
  PRACTICE_REMIX,
  coerceRemixDirections,
  suggestRemixDirections,
  normalizeRemixDirection,
  remixRequest,
  REMIX_DIRECTION_MAX,
} from './practice-remix'
import { dailyCapFor, FEATURE_DAILY_CAP_USD } from './budget'
import { studioManifest } from '@/lib/studio/registry'
import { VOICE_PRIMER } from './voice'
import { PRACTICE_SHAPE_PRIMER } from './practice-shape'

const PRACTICE = {
  title: 'Evening wind-down walk',
  summary: 'You never stop at night. This is the stop.',
  cadence: 'Daily',
  durationMin: 15,
  body: 'Put your shoes on. Walk the block. Leave the phone at home.',
}

beforeEach(() => {
  state.aiOn = true
  state.overBudget = false
  state.lastCall = null
  state.toolInput = {}
  state.ledger = []
})

describe('PRACTICE_REMIX (the declaration)', () => {
  it('runs on Haiku under its own capped budget key for a registered entity', () => {
    expect(PRACTICE_REMIX.feature).toBe('practice-remix')
    expect(PRACTICE_REMIX.tier).toBe('haiku')
    expect(PRACTICE_REMIX.entity).toBe('practice')
    expect(studioManifest(PRACTICE_REMIX.entity)).not.toBeNull()
    expect(FEATURE_DAILY_CAP_USD).toHaveProperty('practice-remix')
    expect(dailyCapFor('practice-remix')).toBeGreaterThan(0)
  })
})

describe('coerceRemixDirections (never trust the model)', () => {
  it('keeps three short, clean, distinct directions', () => {
    expect(
      coerceRemixDirections({
        directions: ['two minutes, for mornings.', 'Gentler', 'gentler', 'With a friend — or two!', 'On a walk'],
      }),
    ).toEqual(['Two minutes, for mornings', 'Gentler', 'With a friend, or two'])
  })

  it('drops a line too long to be a chip', () => {
    const long = 'x'.repeat(REMIX_DIRECTION_MAX + 1)
    expect(coerceRemixDirections({ directions: [long, 'Gentler', 'Before bed'] })).toEqual(['Gentler', 'Before bed'])
  })

  it('answers null when there is nothing to choose between', () => {
    expect(coerceRemixDirections(null)).toBeNull()
    expect(coerceRemixDirections({ directions: 'Gentler' })).toBeNull()
    expect(coerceRemixDirections({ directions: ['Gentler'] })).toBeNull()
    expect(coerceRemixDirections({ directions: [42, '', '  '] })).toBeNull()
  })
})

describe('suggestRemixDirections (the door)', () => {
  it('returns the directions and threads the voice and practice-shape primers', async () => {
    state.toolInput = { directions: ['Two minutes, for mornings', 'Gentler', 'With a friend'] }
    const out = await suggestRemixDirections({ practice: PRACTICE, profileId: 'p1' })
    expect(out).toEqual(['Two minutes, for mornings', 'Gentler', 'With a friend'])
    const system = String(state.lastCall?.system)
    expect(system).toContain(VOICE_PRIMER)
    expect(system).toContain(PRACTICE_SHAPE_PRIMER)
    expect(String((state.lastCall?.messages as { content: string }[])[0].content)).toContain('Evening wind-down walk')
    expect(state.lastCall?.accounting).toMatchObject({ feature: 'practice-remix', profileId: 'p1' })
    expect(state.ledger).toEqual([])
  })

  it('answers null (the plain copy) when AI is off or over budget, without a model call', async () => {
    state.aiOn = false
    expect(await suggestRemixDirections({ practice: PRACTICE })).toBeNull()
    state.aiOn = true
    state.overBudget = true
    expect(await suggestRemixDirections({ practice: PRACTICE })).toBeNull()
    expect(state.lastCall).toBeNull()
  })

  it('never asks about a practice with no name', async () => {
    expect(await suggestRemixDirections({ practice: { ...PRACTICE, title: '  ' } })).toBeNull()
    expect(state.lastCall).toBeNull()
  })
})

describe('the fork half', () => {
  it('bounds a picked direction to a chip and refuses anything else', () => {
    expect(normalizeRemixDirection('  Gentler ')).toBe('Gentler')
    expect(normalizeRemixDirection('x'.repeat(500))).toHaveLength(REMIX_DIRECTION_MAX)
    expect(normalizeRemixDirection('')).toBeNull()
    expect(normalizeRemixDirection(null)).toBeNull()
    expect(normalizeRemixDirection(undefined)).toBeNull()
    expect(normalizeRemixDirection(7)).toBeNull()
  })

  it('frames the direction as a change for the practice-edit path, with no em dash', () => {
    const req = remixRequest('With a friend')
    expect(req).toContain('With a friend')
    expect(req).not.toMatch(/[–—]/)
  })
})
