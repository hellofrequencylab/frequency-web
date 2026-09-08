import { describe, it, expect, vi } from 'vitest'

// The listing-copy reply boundary (ADR-1287): a `{title, description}` object, validated by a
// schema at the edge. The module's other imports touch the ledger, so they are stubbed; only
// the pure parser is under test here.

vi.mock('./usage', () => ({ recordAiUsage: vi.fn(async () => {}), featureOverBudget: vi.fn(async () => false) }))
vi.mock('./client', () => ({ aiEnabled: () => false }))
vi.mock('./rate-limit', () => ({ aiRateLimited: vi.fn(async () => false) }))
vi.mock('./complete', () => ({ completeText: vi.fn(), AiUnavailableError: class extends Error {} }))

import { parseCopy } from './listing-copy'

describe('parseCopy', () => {
  it('reads a well-formed reply, with prose and a fence around it', () => {
    expect(parseCopy('```json\n{"title":"Sunrise swim","description":"Six laps before coffee."}\n```')).toEqual({
      title: 'Sunrise swim',
      description: 'Six laps before coffee.',
    })
  })

  it('accepts one field missing and fills the other with an empty string', () => {
    expect(parseCopy('{"title":"Only a title"}')).toEqual({ title: 'Only a title', description: '' })
  })

  it('refuses a reply with neither field, a wrong-typed field, or no JSON at all', () => {
    expect(parseCopy('{}')).toBeNull()
    expect(parseCopy('{"title":42,"description":"x"}')).toBeNull()
    expect(parseCopy('{"title":"cut')).toBeNull()
    expect(parseCopy('Sorry, I cannot.')).toBeNull()
    expect(parseCopy('')).toBeNull()
  })
})
