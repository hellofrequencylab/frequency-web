import { describe, it, expect } from 'vitest'
import { ENTRY_STAGES } from './registry'
import {
  ONE_OF_SEVERAL_REASON,
  PUBLISH_NOT_YET_REASON,
  STAGE_PIPELINE,
  productionDoorHref,
  stageTimeline,
} from './stage-timeline'

// Locks ADR-1504: four steps, Cancelled is an exit, Publish is a door and not a stage, and the
// ADR-1388 §3 refusal (one of several dates) is said in the row before the server says it.

describe('stageTimeline shape', () => {
  it('walks Pencil, Planning, Production, Publish and never Cancelled', () => {
    const plan = stageTimeline({ stage: 'pencil', oneOfSeveral: false })
    expect(plan.steps.map((s) => s.key)).toEqual(['pencil', 'planning', 'production', 'publish'])
    expect(plan.steps.map((s) => s.label)).toEqual(['Pencil', 'Planning', 'Production', 'Publish'])
    expect(STAGE_PIPELINE).not.toContain('cancelled')
  })

  it('reads the stage labels and hints from the registry, not a second copy', () => {
    for (const key of STAGE_PIPELINE) {
      const def = ENTRY_STAGES.find((d) => d.stage === key)!
      const plan = stageTimeline({ stage: key, oneOfSeveral: false })
      expect(plan.steps.find((s) => s.key === key)!.label).toBe(def.label)
      expect(plan.hint).toBe(def.hint)
    }
  })

  it('marks earlier steps done, the stage current, later steps upcoming', () => {
    const plan = stageTimeline({ stage: 'planning', oneOfSeveral: false })
    expect(plan.steps.map((s) => s.state)).toEqual(['done', 'current', 'upcoming', 'upcoming'])
  })

  it('falls back to Pencil for a missing stage, like the select did', () => {
    expect(stageTimeline({ stage: null, oneOfSeveral: false }).steps[0].state).toBe('current')
  })
})

describe('stageTimeline refusals live in the hint', () => {
  it('holds a date that is one of several at Pencil and says why', () => {
    const plan = stageTimeline({ stage: 'pencil', oneOfSeveral: true })
    expect(plan.steps.find((s) => s.key === 'pencil')!.disabled).toBe(false)
    for (const key of ['planning', 'production', 'publish'] as const) {
      const step = plan.steps.find((s) => s.key === key)!
      expect(step.disabled).toBe(true)
      expect(step.reason).toBe(ONE_OF_SEVERAL_REASON)
    }
    expect(plan.reasons).toEqual([ONE_OF_SEVERAL_REASON])
  })

  it('keeps Publish shut before Production and says what to do first', () => {
    const plan = stageTimeline({ stage: 'planning', oneOfSeveral: false })
    const publish = plan.steps.find((s) => s.key === 'publish')!
    expect(publish.disabled).toBe(true)
    expect(publish.reason).toBe(PUBLISH_NOT_YET_REASON)
    expect(plan.reasons).toEqual([PUBLISH_NOT_YET_REASON])
  })

  it('opens Publish at Production, and the door is never the current step', () => {
    const plan = stageTimeline({ stage: 'production', oneOfSeveral: false })
    const publish = plan.steps.find((s) => s.key === 'publish')!
    expect(publish.disabled).toBe(false)
    expect(publish.state).toBe('upcoming')
    expect(plan.reasons).toEqual([])
  })
})

describe('stageTimeline treats Cancelled as an exit', () => {
  it('has no current step, shows the exit hint, and lets Pencil bring it back', () => {
    const plan = stageTimeline({ stage: 'cancelled', oneOfSeveral: false })
    expect(plan.cancelled).toBe(true)
    expect(plan.steps.some((s) => s.state === 'current')).toBe(false)
    expect(plan.hint).toBe(ENTRY_STAGES.find((d) => d.stage === 'cancelled')!.hint)
    expect(plan.steps.find((s) => s.key === 'pencil')!.disabled).toBe(false)
  })
})

describe('productionDoorHref', () => {
  it('carries the Space and the entry, and the Plan only when there is one', () => {
    expect(productionDoorHref('s1', 'e1')).toBe('/events/new?space=s1&pencil=e1')
    expect(productionDoorHref('s1', 'e1', 'p1')).toBe('/events/new?space=s1&pencil=e1&plan=p1')
    expect(productionDoorHref('s1', 'e1', null)).not.toContain('plan=')
  })
})
