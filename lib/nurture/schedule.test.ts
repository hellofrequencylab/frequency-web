import { describe, it, expect } from 'vitest'
import {
  orderedSteps,
  firstStep,
  stepAtOrder,
  nextStepAfter,
  runAtFrom,
  validateStepInput,
  type NurtureStep,
} from './schedule'

function step(partial: Partial<NurtureStep> & { order: number }): NurtureStep {
  return {
    id: `s${partial.order}`,
    sequenceId: 'seq',
    order: partial.order,
    delayHours: partial.delayHours ?? 24,
    subject: partial.subject ?? 'Hi',
    body: partial.body ?? 'Body',
    enabled: partial.enabled ?? true,
  }
}

describe('nurture scheduling', () => {
  const steps = [step({ order: 3 }), step({ order: 1, delayHours: 0 }), step({ order: 2, enabled: false })]

  it('orders enabled steps ascending and drops disabled', () => {
    expect(orderedSteps(steps).map((s) => s.order)).toEqual([1, 3])
  })

  it('firstStep is the lowest enabled order', () => {
    expect(firstStep(steps)?.order).toBe(1)
    expect(firstStep([])).toBeNull()
  })

  it('stepAtOrder matches only an enabled step at that exact order', () => {
    expect(stepAtOrder(steps, 1)?.id).toBe('s1')
    expect(stepAtOrder(steps, 2)).toBeNull() // disabled
    expect(stepAtOrder(steps, 9)).toBeNull()
  })

  it('nextStepAfter skips a disabled step to the next enabled one', () => {
    // cursor at 1 → next enabled after 1 is 3 (2 is disabled)
    expect(nextStepAfter(steps, 1)?.order).toBe(3)
    // at-or-after pattern used by the runner: nextStepAfter(order-1)
    expect(nextStepAfter(steps, 0)?.order).toBe(1)
    expect(nextStepAfter(steps, 3)).toBeNull() // end of sequence
  })

  it('runAtFrom adds hours and clamps negatives to now', () => {
    const base = Date.UTC(2026, 0, 1, 0, 0, 0)
    expect(runAtFrom(base, 24)).toBe(new Date(base + 86_400_000).toISOString())
    expect(runAtFrom(base, 0)).toBe(new Date(base).toISOString())
    expect(runAtFrom(base, -5)).toBe(new Date(base).toISOString())
  })

  it('validateStepInput catches bad delay / empty fields', () => {
    expect(validateStepInput({ delayHours: 24, subject: 'Hi', body: 'Yo' })).toBeNull()
    expect(validateStepInput({ delayHours: -1, subject: 'Hi', body: 'Yo' })).toMatch(/Delay/)
    expect(validateStepInput({ delayHours: 1.5, subject: 'Hi', body: 'Yo' })).toMatch(/Delay/)
    expect(validateStepInput({ delayHours: 24, subject: '  ', body: 'Yo' })).toMatch(/subject/)
    expect(validateStepInput({ delayHours: 24, subject: 'Hi', body: ' ' })).toMatch(/body/)
  })
})
