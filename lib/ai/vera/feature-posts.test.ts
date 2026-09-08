import { describe, it, expect, vi } from 'vitest'

// The curator's reply boundary (ADR-1287): a JSON array of ids, validated by a schema before any
// id is trusted. The module's I/O is stubbed; the pure parser is what is under test.

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('../complete', () => ({ completeText: vi.fn() }))
vi.mock('../usage', () => ({ aiAvailable: vi.fn(async () => false), featureOverBudget: vi.fn(async () => false), recordAiUsage: vi.fn() }))

import { parseChosenIds } from './feature-posts'

const VALID = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g'])

describe('parseChosenIds', () => {
  it('keeps known ids in the model order, deduped, capped', () => {
    expect(parseChosenIds('["b","a","b","zzz","c","d","e","f","g"]', VALID)).toEqual(['b', 'a', 'c', 'd', 'e', 'f'])
  })

  it('tolerates prose and a fence around the array', () => {
    expect(parseChosenIds('Here: ```json\n["a"]\n``` done', VALID)).toEqual(['a'])
  })

  it('refuses a reply that is not an array of strings (fail closed, nothing featured)', () => {
    expect(parseChosenIds('["a", 7]', VALID)).toEqual([])
    expect(parseChosenIds('{"ids":["a"]}', VALID)).toEqual([])
    expect(parseChosenIds('["a",', VALID)).toEqual([])
    expect(parseChosenIds('none fit', VALID)).toEqual([])
    expect(parseChosenIds('[]', VALID)).toEqual([])
  })
})
