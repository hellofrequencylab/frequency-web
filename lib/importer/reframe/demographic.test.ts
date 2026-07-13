import { describe, it, expect, vi, beforeEach } from 'vitest'

// DEMOGRAPHIC + POSITIONING pass (Importer v2 #1, ADR-606). Pinned properties:
//  1. coerceDemographic never trusts the raw model shape (drops non-strings, trims, caps length).
//  2. The steer folds into the reframe grounding, but only as a labeled STEER (never a fact to restate).
//  3. analyzeDemographic is fail-safe: AI off / no tool block / a throw all return null, so the pipeline
//     reframes exactly as before (backwards-compatible).
// The LLM is mocked; no network.

const completeRawMock = vi.fn()
vi.mock('@/lib/ai/complete', () => ({
  completeRaw: (...args: unknown[]) => completeRawMock(...args),
}))
let aiOn = true
vi.mock('@/lib/ai/client', () => ({ aiEnabled: () => aiOn }))
vi.mock('@/lib/ai/usage', () => ({
  recordAiUsage: vi.fn(),
  featureOverBudget: vi.fn(async () => false),
}))

import {
  coerceDemographic,
  analyzeDemographic,
  DEMOGRAPHIC_TOOL_NAME,
  DEMOGRAPHIC_MAX_LEN,
} from './demographic'
import { buildGroundingBlock } from './prompt'
import type { BusinessProfile } from '../schema'

function toolResponse(input: unknown) {
  return {
    tier: 'sonnet',
    model: 'claude-sonnet-4-6',
    content: [{ type: 'tool_use', name: DEMOGRAPHIC_TOOL_NAME, id: 't1', input }],
    text: '',
    usage: { inputTokens: 10, outputTokens: 10 },
    costUsd: 0.002,
  }
}

const BASE: BusinessProfile = { name: 'Still Point Studio', type: 'business', category: 'yoga studio' }

beforeEach(() => {
  completeRawMock.mockReset()
  aiOn = true
})

describe('coerceDemographic', () => {
  it('keeps a clean string, collapsing whitespace', () => {
    expect(coerceDemographic({ demographic: '  Busy   parents\n who want calm.  ' })).toBe(
      'Busy parents who want calm.',
    )
  })

  it('drops non-strings and empties', () => {
    expect(coerceDemographic({ demographic: 42 })).toBeUndefined()
    expect(coerceDemographic({ demographic: '   ' })).toBeUndefined()
    expect(coerceDemographic({})).toBeUndefined()
    expect(coerceDemographic(null)).toBeUndefined()
    expect(coerceDemographic(undefined)).toBeUndefined()
  })

  it('caps length', () => {
    const long = 'a '.repeat(500)
    const out = coerceDemographic({ demographic: long })
    expect(out).toBeDefined()
    expect(out!.length).toBeLessThanOrEqual(DEMOGRAPHIC_MAX_LEN)
  })
})

describe('buildGroundingBlock demographic steer', () => {
  it('omits the steer when absent (backwards-compatible)', () => {
    expect(buildGroundingBlock(BASE)).not.toMatch(/audience and positioning/i)
  })

  it('includes the steer as a private brief, not a fact', () => {
    const block = buildGroundingBlock({ ...BASE, demographic: 'Post-relocation adults seeking a calm anchor.' })
    expect(block).toMatch(/audience and positioning/i)
    expect(block).toMatch(/Post-relocation adults seeking a calm anchor\./)
    expect(block).toMatch(/NOT a fact to restate/i)
  })
})

describe('analyzeDemographic', () => {
  it('returns the coerced steer + cost on a tool response', async () => {
    completeRawMock.mockResolvedValueOnce(toolResponse({ demographic: 'Busy parents who want a quick honest cut.' }))
    const res = await analyzeDemographic({ verified: BASE })
    expect(res).not.toBeNull()
    expect(res!.demographic).toBe('Busy parents who want a quick honest cut.')
    expect(res!.costUsd).toBeCloseTo(0.002)
  })

  it('returns null when AI is off (no model call)', async () => {
    aiOn = false
    const res = await analyzeDemographic({ verified: BASE })
    expect(res).toBeNull()
    expect(completeRawMock).not.toHaveBeenCalled()
  })

  it('returns null when the model returns no tool block', async () => {
    completeRawMock.mockResolvedValueOnce({ ...toolResponse({}), content: [{ type: 'text', text: 'nope' }] })
    expect(await analyzeDemographic({ verified: BASE })).toBeNull()
  })

  it('returns null when the read is empty (thin material)', async () => {
    completeRawMock.mockResolvedValueOnce(toolResponse({ demographic: '   ' }))
    expect(await analyzeDemographic({ verified: BASE })).toBeNull()
  })

  it('returns null (never throws) on a model error', async () => {
    completeRawMock.mockRejectedValueOnce(new Error('boom'))
    expect(await analyzeDemographic({ verified: BASE })).toBeNull()
  })
})
