// FH-042S: Trail challenges (ADR-1977). A fork and a Mystery publish without JSON, the plain answer is
// never kept, and a Trail with no challenges publishes exactly as before.
import { describe, expect, it } from 'vitest'
import { challengeProblems, challengeViews, mergeChallenges, parseChallenges, remapChallenges, stopLayers, type Challenge } from './challenges'
import { canonicalContent, draftToGraph, publishChecklist, publishRows } from './draft'
import { evaluate, validateGraph } from './graph'
import { hashAnswer, judgeAnswer } from './mystery'

const stop = (n: number, over: Record<string, unknown> = {}) => ({ place: `Place ${n}`, clue: `Clue ${n}`, hint: '', placementReady: true, ...over })
const draft = (count: number) => ({
  title: 'Harbor walk', hook: '', area: '', audience: '',
  stops: Array.from({ length: count }, (_, i) => stop(i + 1)),
  routeTestedAtRevision: 4, permissionConfirmed: true,
})
const blank = { mystery: false, question: '', hint: '', answerHash: null, fork: '', standIn: '' } as const
const HASH = hashAnswer('The Old Lighthouse')

// Stop 1, then a fork of stops 2 and 3, then a Mystery at stop 4 paired with a staffed stand-in at stop 5, then stop 6.
const forkAndMystery: Challenge[] = [
  { ...blank, stop: 1, fork: '1' },
  { ...blank, stop: 2, fork: '1' },
  { ...blank, stop: 3, mystery: true, question: 'What is painted on the door?', hint: 'Look up.', answerHash: HASH, standIn: '1' },
  { ...blank, stop: 4, standIn: '1' },
]

describe('challenges as stored', () => {
  it('reads only well formed challenges, one per stop', () => {
    const read = parseChallenges([
      { stop: 1, fork: '1' }, { stop: 1, fork: '2' }, { stop: 'x' }, { stop: 2, fork: '9', answerHash: 'plain words', answer: 'secret' },
    ])
    expect(read).toEqual([{ ...blank, stop: 1, fork: '1' }, { ...blank, stop: 2 }])
    expect(JSON.stringify(read)).not.toContain('secret')
  })

  it('keeps the hash, never the plain answer, and keeps an answer set when the field is left blank', () => {
    const typed = new Map([[3, HASH]])
    const merged = mergeChallenges([{ stop: 3, mystery: true, question: 'Q', answer: 'The Old Lighthouse' }], typed, [])
    expect(merged[0].answerHash).toBe(HASH)
    expect(JSON.stringify(merged)).not.toMatch(/Old Lighthouse/i)
    const kept = mergeChallenges([{ stop: 3, mystery: true, question: 'Q', answer: '' }], new Map(), merged)
    expect(kept[0].answerHash).toBe(HASH)
    // A sent hash is ignored: only the server's own hash or the stored one counts.
    expect(mergeChallenges([{ stop: 3, mystery: true, answerHash: hashAnswer('forged') }], new Map(), [])[0].answerHash).toBeNull()
    // A stop that stops being a Mystery drops its answer.
    expect(mergeChallenges([{ stop: 3, mystery: false }], new Map(), merged)[0].answerHash).toBeNull()
  })

  it('shows the editor only whether an answer is set', () => {
    const views = challengeViews(forkAndMystery)
    expect(views[2]).toMatchObject({ stop: 3, answerSet: true })
    expect(JSON.stringify(views)).not.toContain(HASH)
  })

  it('moves a challenge with its stop, and drops it with a removed stop', () => {
    expect(remapChallenges([{ stop: 1 }, { stop: 2 }], [0, 2, 1]).map((c) => c.stop)).toEqual([2, 1])
    expect(remapChallenges([{ stop: 1 }, { stop: 2 }], [0, 2]).map((c) => c.stop)).toEqual([1])
  })
})

describe('publishing a fork and a Mystery without JSON', () => {
  const d = draft(6)

  it('groups neighbouring stops of one fork or pair into a layer', () => {
    expect(stopLayers(6, forkAndMystery)).toEqual([[0], [1, 2], [3, 4], [5]])
  })

  it('builds a graph the engine accepts, with the fork as choice_group and the pair as fallback_group', () => {
    const graph = draftToGraph(d, forkAndMystery)
    expect(validateGraph(graph)).toMatchObject({ ok: true })
    expect(graph.missions[1]).toMatchObject({ choice_group: 'fork-1', rule_groups: [{ logic: 'all', members: ['stop-1'] }] })
    expect(graph.missions[3]).toMatchObject({ kind: 'answer', fallback_group: 'stand-in-1', rule_groups: [{ logic: 'any', members: ['stop-2', 'stop-3'] }] })
    expect(graph.missions[5].rule_groups).toEqual([{ logic: 'any', members: ['stop-4', 'stop-5'] }])
  })

  it('closes the other branch once a player picks one, and the stand-in finishes a locked-out Mystery', () => {
    const graph = draftToGraph(d, forkAndMystery)
    const credits = ['stop-1', 'stop-3', 'stop-5'].map((mission_key, i) => ({ mission_key, accepted_at: `2026-11-18T10:0${i}:00Z` }))
    const ev = evaluate(graph, credits, new Date('2026-11-18T12:00:00Z'))
    expect(ev.status['stop-2']).toBe('closed')
    expect(ev.status['stop-4']).toBe('closed')
    expect(ev.eligible).toContain('stop-6')
  })

  it('writes the mission rows: the question with the clue, the challenge hint, and only the hash', () => {
    const rows = publishRows(d, forkAndMystery)
    const mystery = rows.missions[3]
    expect(mystery).toMatchObject({ kind: 'answer', visible_body: 'Clue 4\n\nQuestion: What is painted on the door?', locked_teaser: 'Look up.', answer_hash: HASH, fallback_group: 'stand-in-1' })
    expect(judgeAnswer({ stored: mystery.answer_hash, attempt: 'the old  lighthouse', attemptsUsed: 0 })).toEqual({ outcome: 'correct' })
    expect(rows.missions.every((m) => 'choice_group' in m && 'fallback_group' in m && 'answer_hash' in m)).toBe(true)
    expect(rows.groups.find((g) => g.target_mission_key === 'stop-4')).toMatchObject({ logic: 'any', members: ['stop-2', 'stop-3'] })
  })

  it('passes the checklist, and a Trail with no challenges publishes exactly as before', () => {
    expect(publishChecklist(d, 4, { challenges: forkAndMystery }).ok).toBe(true)
    expect(publishRows(d, [])).toEqual(publishRows(d))
    expect(draftToGraph(d, [])).toEqual(draftToGraph(d))
    expect(canonicalContent(d, [])).toBe(canonicalContent(d))
    expect(publishRows(d).missions[0]).not.toHaveProperty('choice_group')
  })
})

describe('the blockers an author reads', () => {
  const views = (list: Challenge[]) => challengeViews(list)
  const messages = (list: Challenge[], count = 6) => challengeProblems(count, views(list)).map((p) => p.message)

  it('asks a Mystery for its question, its answer and a stand-in', () => {
    expect(messages([{ ...blank, stop: 2, mystery: true }])).toEqual([
      'This Mystery needs a question.',
      'This Mystery needs an answer.',
      'Put this Mystery in a stand-in set with another stop, so a player who runs out of tries still has a way on.',
    ])
  })

  it('refuses a fork of one stop, a fork split by another stop, a stop in both, and a challenge on a stop that is gone', () => {
    expect(messages([{ ...blank, stop: 1, fork: '2' }])).toContain('A fork needs at least two stops. Add another stop to it or clear it.')
    expect(messages([{ ...blank, stop: 1, fork: '1' }, { ...blank, stop: 3, fork: '1' }])).toContain('The stops in one fork have to sit next to each other in the trail.')
    expect(messages([{ ...blank, stop: 1, fork: '1', standIn: '1' }, { ...blank, stop: 2, fork: '1' }])).toContain('A stop can be in a fork or a stand-in set, not both.')
    expect(messages([{ ...blank, stop: 5, fork: '1' }, { ...blank, stop: 4, fork: '1' }], 5)).toContain('A challenge points at a stop that is no longer on the trail. Remove it or pick another stop.')
  })

  it('holds publish shut until they are fixed, with no em dash in any of them', () => {
    const list: Challenge[] = [{ ...blank, stop: 2, mystery: true }]
    const checklist = publishChecklist(draft(6), 4, { challenges: list })
    expect(checklist.ok).toBe(false)
    expect(checklist.items.filter((i) => i.code === 'challenge').every((i) => !i.message.includes('—'))).toBe(true)
  })
})
