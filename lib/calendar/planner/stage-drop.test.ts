import { describe, expect, it, vi } from 'vitest'
import { overlayPlans, planStageDrop, runStageWrite, workflowStageOf } from './stage-drop'
import type { PlanStage, PlannerPlan } from './types'

const OWN = 's-own'
const plan = (stage: PlanStage, over: Partial<PlannerPlan> = {}): PlannerPlan => ({
  id: 'p1',
  title: 'Supper club',
  stage,
  target: 'Event',
  team: [],
  spaces: [{ id: OWN, role: 'Host', status: 'accepted' }],
  ...over,
})

describe('workflowStageOf', () => {
  it('names the server stage for each column', () => {
    expect(workflowStageOf('pencil')).toBe('pencil')
    expect(workflowStageOf('planning')).toBe('plan')
    expect(workflowStageOf('production')).toBe('production')
    expect(workflowStageOf('cancelled')).toBe('cancelled')
  })
  it('writes Production for a Plan that is live, because Production stays open', () => {
    expect(workflowStageOf('event')).toBe('production')
  })
})

describe('planStageDrop', () => {
  it('does nothing on the column it came from', () => {
    expect(planStageDrop(plan('pencil'), 'pencil', OWN)).toEqual({ kind: 'noop' })
  })
  it('moves a Plan one stage with a write and the write that puts it back', () => {
    expect(planStageDrop(plan('pencil'), 'planning', OWN)).toMatchObject({
      kind: 'ready',
      move: { from: 'pencil', to: 'planning', write: { planId: 'p1', stage: 'plan' }, undo: { planId: 'p1', stage: 'pencil' }, line: 'Moved Supper club to Planning.' },
    })
  })
  it('lets a Plan jump any number of stages', () => {
    expect(planStageDrop(plan('pencil'), 'production', OWN)).toMatchObject({ kind: 'ready', move: { write: { stage: 'production' } } })
  })
  it('cancels, says the dates stay struck through, and undoes to the stage it left', () => {
    expect(planStageDrop(plan('planning'), 'cancelled', OWN)).toMatchObject({
      kind: 'ready',
      move: { write: { stage: 'cancelled' }, undo: { stage: 'plan' }, line: 'Cancelled Supper club. It stays on the team calendar, struck through.' },
    })
  })
  it('brings a cancelled Plan back from its column', () => {
    expect(planStageDrop(plan('cancelled'), 'planning', OWN)).toMatchObject({
      kind: 'ready',
      move: { write: { stage: 'plan' }, undo: { stage: 'cancelled' }, line: 'Brought Supper club back to Planning.' },
    })
  })
  it('does not publish by dragging: Go live launches', () => {
    const out = planStageDrop(plan('production'), 'event', OWN)
    expect(out.kind).toBe('refused')
    expect(out.kind === 'refused' && out.line).toContain('Go live')
  })
  it('keeps a live Plan in Production until the event is done', () => {
    expect(planStageDrop(plan('event'), 'planning', OWN).kind).toBe('refused')
    expect(planStageDrop(plan('event'), 'pencil', OWN).kind).toBe('refused')
  })
  it('lets a live Plan be cancelled, and puts it back to Production', () => {
    expect(planStageDrop(plan('event'), 'cancelled', OWN)).toMatchObject({
      kind: 'ready',
      move: { write: { stage: 'cancelled' }, undo: { stage: 'production' } },
    })
  })
  it("leaves another Space's Plan to that Space", () => {
    const theirs = plan('planning', {
      spaces: [
        { id: 's-other', role: 'Host', status: 'accepted' },
        { id: OWN, role: 'Co-host', status: 'accepted' },
      ],
    })
    const out = planStageDrop(theirs, 'production', OWN)
    expect(out.kind).toBe('refused')
    expect(out.kind === 'refused' && out.line).toContain('another Space')
  })
  it('lets a Plan this Space hosts move even with a co-host on it', () => {
    const mine = plan('planning', {
      spaces: [
        { id: OWN, role: 'Host', status: 'accepted' },
        { id: 's-other', role: 'Co-host', status: 'accepted' },
      ],
    })
    expect(planStageDrop(mine, 'production', OWN).kind).toBe('ready')
  })
})

describe('overlayPlans', () => {
  it('lays a moved stage over a Plan and leaves the others', () => {
    const out = overlayPlans([plan('pencil'), plan('planning', { id: 'p2' })], { p1: 'cancelled' })
    expect(out.map((p) => p.stage)).toEqual(['cancelled', 'planning'])
  })
})

describe('runStageWrite', () => {
  it('resolves null when the server saved', async () => {
    const setStage = vi.fn().mockResolvedValue({ data: undefined })
    expect(await runStageWrite({ planId: 'p1', stage: 'plan' }, { setStage })).toBeNull()
    expect(setStage).toHaveBeenCalledWith('p1', 'plan')
  })
  it('returns the server sentence on a refusal and a plain one on a throw', async () => {
    expect(await runStageWrite({ planId: 'p1', stage: 'plan' }, { setStage: async () => ({ error: 'That Plan no longer exists.' }) })).toBe(
      'That Plan no longer exists.',
    )
    expect(
      await runStageWrite({ planId: 'p1', stage: 'plan' }, {
        setStage: async () => {
          throw new Error('x')
        },
      }),
    ).toBe('Something went wrong. Try again.')
  })
  it('says so when the page gave it no stage write', async () => {
    expect(await runStageWrite({ planId: 'p1', stage: 'plan' }, {})).toContain('not available')
  })
})
