import { describe, it, expect, beforeEach, vi } from 'vitest'

// Vera's curation fill (LIVE-644, ADR-1607). The contract this file owns is the fill-only-empty
// rule, at draft AND at write: a card hook only when the summary is blank, tags only under the
// floor, canonical tags first, and nothing a person wrote is ever replaced.

let fakePractice: Record<string, unknown> | null = null
let fakeTags: string[] = []
let aiOn = true
let replyText = '{"hook":null,"tags":[]}'

const updatePractice = vi.fn(async (_id: string, _patch: Record<string, unknown>) => null)
const setPracticeTags = vi.fn(async (_id: string, _labels: string[], _opts: Record<string, unknown>) => {})
const completeText = vi.fn(async (_p: { system: string }) => ({
  text: replyText,
  usage: { inputTokens: 10, outputTokens: 10 },
  costUsd: 0.0001,
  tier: 'haiku',
}))
const recordAiUsage = vi.fn(async () => {})

vi.mock('@/lib/practices', () => ({
  getPractice: vi.fn(async () => fakePractice),
  getPracticeTagLabels: vi.fn(async () => fakeTags),
  listCanonicalTags: vi.fn(async () => [
    { slug: 'breathwork', label: 'Breathwork' },
    { slug: 'morning', label: 'Morning' },
    { slug: 'focus', label: 'Focus' },
  ]),
  updatePractice: (id: string, patch: Record<string, unknown>) => updatePractice(id, patch),
  setPracticeTags: (id: string, labels: string[], opts: Record<string, unknown>) => setPracticeTags(id, labels, opts),
}))

vi.mock('./usage', () => ({
  aiAvailable: vi.fn(async () => aiOn),
  featureOverBudget: vi.fn(async () => false),
  recordAiUsage: () => recordAiUsage(),
}))

vi.mock('./complete', () => ({
  completeText: (p: { system: string }) => completeText(p),
  AiUnavailableError: class AiUnavailableError extends Error {},
}))

import {
  applyPracticeCuration,
  cleanHook,
  curationGaps,
  draftPracticeCuration,
  parseCurateJson,
  pickTags,
  CURATE_TAG_FLOOR,
} from './practice-curate'
import { VOICE_PRIMER } from './voice'

beforeEach(() => {
  fakePractice = { id: 'p1', title: 'Box breathing', summary: null, description: null, body: 'Four in, four out.' }
  fakeTags = []
  aiOn = true
  replyText = '{"hook":null,"tags":[]}'
  updatePractice.mockClear()
  setPracticeTags.mockClear()
  completeText.mockClear()
  recordAiUsage.mockClear()
})

describe('curationGaps', () => {
  it('opens the hook gap only on a blank summary and the tag gap only under the floor', () => {
    expect(curationGaps({ summary: '  ', tagCount: 0 })).toEqual({ hook: true, tags: true })
    expect(curationGaps({ summary: 'Calm down fast.', tagCount: CURATE_TAG_FLOOR })).toEqual({ hook: false, tags: false })
  })
})

describe('pickTags', () => {
  it('puts canonical matches first, in their canonical spelling, and lets in one new word', () => {
    const out = pickTags(['desk', 'breath work', 'couch', 'MORNING'], {
      canonical: ['Breathwork', 'Morning'],
      existing: [],
      room: 3,
    })
    expect(out).toEqual(['Breathwork', 'Morning', 'desk'])
  })

  it('drops what the practice already carries and respects the room', () => {
    expect(pickTags(['Focus', 'Morning', 'Breathwork'], { canonical: ['Focus', 'Morning', 'Breathwork'], existing: ['focus'], room: 1 })).toEqual([
      'Morning',
    ])
    expect(pickTags(['Focus'], { canonical: ['Focus'], existing: [], room: 0 })).toEqual([])
  })
})

describe('cleanHook + parseCurateJson', () => {
  it('strips dashes and wrapping quotes and caps the hook', () => {
    expect(cleanHook('"Wired all day — this is for that."')).not.toMatch(/[–—"]/)
    expect((cleanHook('word '.repeat(60)) ?? '').length).toBeLessThanOrEqual(140)
    expect(cleanHook('   ')).toBeNull()
  })

  it('reads a fenced reply and degrades junk to an empty offer', () => {
    expect(parseCurateJson('```json\n{"hook":"Short.","tags":["focus", 3]}\n```')).toEqual({ hook: 'Short.', tags: ['focus'] })
    expect(parseCurateJson('nope')).toEqual({ hook: null, tags: [] })
  })
})

describe('draftPracticeCuration', () => {
  it('makes no model call when nothing is empty', async () => {
    fakePractice = { ...fakePractice, summary: 'You are always wired. This is for that.' }
    fakeTags = ['Focus', 'Morning', 'Breathwork']
    const d = await draftPracticeCuration('p1')
    expect(d).toEqual({ hook: null, tags: [], asked: { hook: false, tags: false } })
    expect(completeText).not.toHaveBeenCalled()
  })

  it('degrades to null when AI is off', async () => {
    aiOn = false
    expect(await draftPracticeCuration('p1')).toBeNull()
    expect(completeText).not.toHaveBeenCalled()
  })

  it('drafts through the voice primer and records usage under its own key', async () => {
    replyText = '{"hook":"Two minutes, before the day gets loud.","tags":["breathwork","calm"]}'
    const d = await draftPracticeCuration('p1')
    expect(d?.hook).toBe('Two minutes, before the day gets loud.')
    expect(d?.tags).toEqual(['Breathwork', 'calm'])
    expect(completeText.mock.calls[0]?.[0].system).toContain(VOICE_PRIMER)
    expect(recordAiUsage).toHaveBeenCalledTimes(1)
  })

  it('never offers a hook when the summary was written, even if Vera returns one', async () => {
    fakePractice = { ...fakePractice, summary: 'Already written by a person.' }
    replyText = '{"hook":"A replacement.","tags":["focus"]}'
    const d = await draftPracticeCuration('p1')
    expect(d?.hook).toBeNull()
    expect(d?.tags).toEqual(['Focus'])
  })
})

describe('applyPracticeCuration', () => {
  it('writes the hook through updatePractice while the summary is still empty', async () => {
    const r = await applyPracticeCuration('p1', { hook: 'Two minutes, before the day gets loud.' }, 'curator-1')
    expect(updatePractice).toHaveBeenCalledWith('p1', { summary: 'Two minutes, before the day gets loud.' })
    expect(r).toEqual({ hookWritten: true, hookKept: false, tagsAdded: 0 })
  })

  it('keeps a hook a person wrote between the draft and the accept', async () => {
    fakePractice = { ...fakePractice, summary: 'Written by hand meanwhile.' }
    const r = await applyPracticeCuration('p1', { hook: 'Vera draft.' }, 'curator-1')
    expect(updatePractice).not.toHaveBeenCalled()
    expect(r).toEqual({ hookWritten: false, hookKept: true, tagsAdded: 0 })
  })

  it('adds tags as Vera and passes every existing tag through, so none is dropped', async () => {
    fakeTags = ['Focus']
    const r = await applyPracticeCuration('p1', { tags: ['Morning', 'focus', 'desk', 'extra'] }, 'curator-1')
    expect(setPracticeTags).toHaveBeenCalledWith('p1', ['Focus', 'Morning', 'desk'], { source: 'vera', assignedBy: 'curator-1' })
    expect(r.tagsAdded).toBe(2)
  })

  it('adds no tags once the practice has reached the floor', async () => {
    fakeTags = ['Focus', 'Morning', 'Breathwork']
    const r = await applyPracticeCuration('p1', { tags: ['desk'] }, 'curator-1')
    expect(setPracticeTags).not.toHaveBeenCalled()
    expect(r.tagsAdded).toBe(0)
  })
})
