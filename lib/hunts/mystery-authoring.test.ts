import { describe, expect, it } from 'vitest'
import { HUNT_MANIFEST } from '@/lib/studio/entities/hunt'
import { blockerMessage, canonicalContent, draftToGraph, parseTrailDraft, passportCount, previewTrail, publishChecklist, publishRows, reorderStops, type TrailDraft } from './draft'
import { validateGraph } from './graph'
import { hashAnswer, judgeAnswer, lockedMysteries, MAX_ANSWER_ATTEMPTS, sealDraftAnswers } from './mystery'
import { answerRefusalWords, projectForPlayer, standInPositions } from './player'

// FH-042S: forks and Mystery stops authored through the draft, and what the player sees of them.
const stop = (n: number) => ({ place: `Place ${n}`, clue: `Clue ${n}`, placementReady: true })
const draft = (over: Partial<TrailDraft> = {}): TrailDraft => ({
  title: 'Harbor walk', hook: '', area: '', audience: '',
  stops: [1, 2, 3, 4].map(stop), routeTestedAtRevision: 4, permissionConfirmed: true, ...over,
})
const HASH = hashAnswer('Lighthouse', Buffer.alloc(16, 7))

describe('a fork on a Trail', () => {
  const forked = draft({ choices: [{ name: 'Left or right', stops: ['stop-2', 'stop-3'] }] })

  it('puts both stops on one step, opens the next on either, and publishes without touching JSON', () => {
    const g = draftToGraph(forked)
    expect(g.missions.map((m) => m.choice_group ?? null)).toEqual([null, 'choice-1', 'choice-1', null])
    expect(g.missions[2].rule_groups).toEqual([{ logic: 'all', members: ['stop-1'] }])
    expect(g.missions[3].rule_groups).toEqual([{ logic: 'any', members: ['stop-2', 'stop-3'] }])
    expect(validateGraph(g).ok).toBe(true)
    expect(publishChecklist(forked, 4).ok).toBe(true)
    expect(publishRows(forked).groups.find((x) => x.key === 'stop-4:needs')).toMatchObject({ logic: 'any', members: ['stop-2', 'stop-3'] })
  })

  it('closes the other stop once a player picks one, and still finishes', () => {
    const picked = previewTrail(forked, ['stop-1', 'stop-3'])
    expect(picked.status['stop-2']).toBe('closed')
    expect(picked.status['stop-4']).toBe('eligible')
    expect(previewTrail(forked, ['stop-1', 'stop-3', 'stop-4']).finished).toBe(true)
  })

  it('words a fork with one stop for the resident', () => {
    const one = draft({ choices: [{ name: '', stops: ['stop-2'] }] })
    const item = publishChecklist(one, 4).items.find((i) => i.code === 'graph')
    expect(item).toMatchObject({ ok: false, message: 'Each fork needs at least two stops to pick from.' })
  })

  it('counts a fork once toward a Passport with no number set', () => {
    const p = draft({ shape: 'passport', choices: [{ name: '', stops: ['stop-1', 'stop-2'] }] })
    expect(passportCount(p)).toBe(3)
    expect(publishChecklist(p, 4).ok).toBe(true)
    const tooMany = publishChecklist({ ...p, finishCount: 4 }, 4).items.find((i) => i.code === 'graph')
    expect(tooMany?.ok).toBe(false)
  })
})

describe('a Mystery stop with a stand-in', () => {
  const mystery = draft({ mysteries: [{ stop: 'stop-2', fallback: 'stop-3', answerHash: HASH }] })

  it('publishes an answer mission and its stand-in under one fallback group, with only the hash', () => {
    const rows = publishRows(mystery)
    expect(rows.missions[1]).toMatchObject({ kind: 'answer', fallback_group: 'mystery-1', answer_hash: HASH })
    expect(rows.missions[2]).toMatchObject({ kind: 'visit', fallback_group: 'mystery-1' })
    expect(rows.missions[2]).not.toHaveProperty('answer_hash')
    expect(validateGraph(draftToGraph(mystery)).ok).toBe(true)
    expect(publishChecklist(mystery, 4).ok).toBe(true)
    expect(canonicalContent(mystery).toLowerCase()).not.toContain('lighthouse')
    // A player out of tries finishes through the stand-in.
    expect(previewTrail(mystery, ['stop-1', 'stop-3', 'stop-4']).finished).toBe(true)
  })

  it('keeps a Trail with no fork or Mystery exactly as before', () => {
    const plain = draft()
    expect(publishRows(plain).missions[0]).toEqual({ mission_key: 'stop-1', title: 'Place 1', visible_body: 'Clue 1', locked_teaser: null, kind: 'visit', required_assurance: 'signed_node' })
    expect(Object.keys(parseTrailDraft(plain))).not.toContain('mysteries')
  })

  it('refuses to publish a Mystery with no answer set', () => {
    const unset = draft({ mysteries: [{ stop: 'stop-2', fallback: 'stop-3' }] })
    expect(publishChecklist(unset, 4).items.find((i) => i.code === 'mystery_answer')).toMatchObject({ ok: false, stop: 1 })
  })

  it('stores only the hash: the save seals a typed answer and the draft reader drops anything else', () => {
    const sealed = sealDraftAnswers({ ...mystery, mysteries: [{ stop: 'stop-2', fallback: 'stop-3', answer: '  Lighthouse ' }] })
    const parsed = parseTrailDraft(sealed)
    expect(JSON.stringify(parsed).toLowerCase()).not.toContain('lighthouse')
    const hash = parsed.mysteries?.[0].answerHash
    expect(hash).toMatch(/^s1:[0-9a-f]{32}:[0-9a-f]{64}$/)
    expect(judgeAnswer({ stored: hash, attempt: 'LIGHTHOUSE', attemptsUsed: 0 })).toEqual({ outcome: 'correct' })
    // A plain answer that skipped the save, or a forged hash, never reaches the draft.
    expect(parseTrailDraft({ ...mystery, mysteries: [{ stop: 'stop-2', fallback: 'stop-3', answer: 'Lighthouse', answerHash: 'lighthouse' }] }).mysteries).toEqual([{ stop: 'stop-2', fallback: 'stop-3' }])
    // No new answer keeps the hash already there.
    expect(parseTrailDraft(sealDraftAnswers(mystery)).mysteries?.[0].answerHash).toBe(HASH)
  })

  it('keeps a stop in one fork or one Mystery, and moves both with their stops', () => {
    const parsed = parseTrailDraft({ ...draft(), choices: [{ name: 'A', stops: ['stop-1', 'stop-2'] }], mysteries: [{ stop: 'stop-2', fallback: 'stop-3' }, { stop: 'stop-3', fallback: 'stop-3' }] })
    expect(parsed.mysteries).toBeUndefined()
    const moved = reorderStops(mystery, [1, 0, 2, 3])
    expect(moved.mysteries).toEqual([{ stop: 'stop-1', fallback: 'stop-3', answerHash: HASH }])
    expect(reorderStops(mystery, [0, 1, 3]).mysteries).toBeUndefined()
  })

  it('words the publish blockers in the resident\'s terms', () => {
    const both = { code: 'BRANCH_INVALID' as const, message: 'Mission "stop-2" is in a choice group and a fallback group. Pick one.', mission_keys: ['stop-2'] }
    expect(blockerMessage(both)).toBe('Stop 2 is in a fork and a Mystery. Keep it in one of them.')
    expect(blockerMessage({ code: 'MYSTERY_NO_FALLBACK', message: '', mission_keys: ['stop-2'] })).toMatch(/^A player who runs out of tries on a Mystery would be stuck\./)
  })
})

describe('the player side of a Mystery', () => {
  const mystery = draft({ mysteries: [{ stop: 'stop-2', fallback: 'stop-3', answerHash: HASH }] })
  const graph = { ...draftToGraph(mystery), missions: draftToGraph(mystery).missions.map((m) => ({ ...m, placements: undefined })) }
  const content = mystery.stops.map((s, i) => ({ mission_key: `stop-${i + 1}`, title: s.place, visible_body: s.clue, locked_teaser: null }))
  const base = { graph, content, credits: [{ mission_key: 'stop-1' }], now: new Date('2026-11-16T12:00:00Z'), huntState: 'published' as const, revision: 1, hints: { enabled: true } }

  it('marks the playable Mystery, and once its tries are used names the stand-in as the next stop', () => {
    const open = projectForPlayer(base)
    expect(open.nextKey).toBe('stop-2')
    expect(open.stops[1]).toMatchObject({ state: 'eligible', mystery: true })
    const out = projectForPlayer({ ...base, lockedAnswers: ['stop-2'] })
    expect(out.nextKey).toBe('stop-3')
    expect(out.stops[1]).toEqual({ key: 'stop-2', position: 2, state: 'closed', closedBecause: 'answer_locked' })
    expect(out.canClaim).toBe(true)
  })

  it('says the stand-in is not needed once the Mystery is solved, and a fork\'s other stop was the other path', () => {
    expect(projectForPlayer({ ...base, credits: [{ mission_key: 'stop-1' }, { mission_key: 'stop-2' }] }).stops[2]).toMatchObject({ state: 'closed', closedBecause: 'not_needed' })
    const forked = draft({ choices: [{ name: '', stops: ['stop-2', 'stop-3'] }] })
    const view = projectForPlayer({ ...base, graph: draftToGraph(forked), credits: [{ mission_key: 'stop-1' }, { mission_key: 'stop-3' }] })
    expect(view.stops[1]).toMatchObject({ state: 'closed', closedBecause: 'other_path' })
  })

  it('locks a Mystery only after every try was wrong', () => {
    const wrong = Array.from({ length: MAX_ANSWER_ATTEMPTS }, () => ({ mission_key: 'stop-2', correct: 'false' }))
    expect(lockedMysteries(wrong)).toEqual(['stop-2'])
    expect(lockedMysteries(wrong.slice(1))).toEqual([])
    expect(lockedMysteries([...wrong.slice(1), { mission_key: 'stop-2', correct: 'true' }])).toEqual([])
  })

  it('words each verdict plainly, with tries left, the hint, and the stand-in', () => {
    expect(answerRefusalWords({ reason: 'answer_required' }).message).toBe('This stop is a Mystery. Type your answer to confirm it.')
    expect(answerRefusalWords({ reason: 'answer_wrong', attemptsLeft: 1, hint: 'It guides ships.' })).toEqual({ message: 'Not quite. You have 1 try left.', hint: 'It guides ships.' })
    expect(answerRefusalWords({ reason: 'answer_wrong', attemptsLeft: 3 }).message).toBe('Not quite. You have 3 tries left.')
    expect(answerRefusalWords({ reason: 'answer_locked', attemptsLeft: 0 }, standInPositions(graph, content, 'stop-2')).message)
      .toBe('That was your last try on this Mystery. Head to stop 3 instead. It counts the same.')
    for (const words of [answerRefusalWords({ reason: 'answer_locked', attemptsLeft: 0 }), answerRefusalWords({ reason: 'answer_wrong', attemptsLeft: 2 })]) {
      expect(words.message).not.toMatch(/—|failed|denied|invalid/i)
    }
  })
})

describe('the Hunt manifest offers forks and Mysteries by stop', () => {
  it('declares the forks and Mystery stops as their own repeats, with no group or hash field', () => {
    const repeat = (p: string) => HUNT_MANIFEST.repeats?.find((r) => r.arrayPath === p)?.fields ?? []
    expect(repeat('choices').map((f) => [f.path, f.kind])).toEqual([['name', 'text'], ['stops', 'multiselect']])
    expect(repeat('mysteries').map((f) => [f.path, f.kind, f.optionsFrom])).toEqual([['stop', 'select', 'hunt-stops'], ['answer', 'text', undefined], ['fallback', 'select', 'hunt-stops']])
    expect([...repeat('choices'), ...repeat('mysteries')].some((f) => /group|hash|json/i.test(f.path))).toBe(false)
  })
})
