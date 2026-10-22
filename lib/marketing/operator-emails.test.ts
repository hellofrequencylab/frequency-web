import { describe, expect, it } from 'vitest'
import { buildOperatorEmail, operatorFocus, OPERATOR_DAYS, type OperatorFocus } from './operator-emails'
import { PLAN_STORY } from '@/lib/pricing/plan-story'

const FOCI: OperatorFocus[] = ['packages', 'membership', 'ticketed', 'donations', 'general']
const base = { to: 'a@example.com', greetingName: 'Sam', spaceName: 'Dune Yoga', spaceSlug: 'dune-yoga', baseUrl: 'https://frequencylocal.com' }

describe('operatorFocus', () => {
  it('reads what a Space runs from its type and Focus', () => {
    expect(operatorFocus('nonprofit', null)).toBe('donations')
    expect(operatorFocus('business', 'packages')).toBe('packages')
    expect(operatorFocus('business', 'membership')).toBe('membership')
    expect(operatorFocus('business', 'ticketed')).toBe('ticketed')
    expect(operatorFocus('business', null)).toBe('general')
    expect(operatorFocus(null, 'nope')).toBe('general')
  })
})

describe('buildOperatorEmail', () => {
  for (const day of OPERATOR_DAYS) {
    for (const focus of FOCI) {
      it(`day ${day} ${focus}: plain copy, one link to the Space`, () => {
        const e = buildOperatorEmail({ day, focus, ...base })
        expect(e.subject.length).toBeGreaterThan(10)
        expect(`${e.subject} ${e.text}`).not.toMatch(/[!—–]/)
        expect(e.html).toContain('/spaces/dune-yoga')
        expect(e.text).toContain('Hi Sam,')
      })
    }
  }

  it('states the Crew requirement once, on day 1 only, from the one pricing line', () => {
    expect(buildOperatorEmail({ day: 1, focus: 'general', ...base }).text).toContain(PLAN_STORY.crewSpace)
    expect(buildOperatorEmail({ day: 3, focus: 'general', ...base }).text).not.toContain(PLAN_STORY.crewSpace)
    expect(buildOperatorEmail({ day: 7, focus: 'general', ...base }).text).not.toContain(PLAN_STORY.crewSpace)
  })

  it('greets without a name', () => {
    const text = buildOperatorEmail({ day: 1, focus: 'general', ...base, greetingName: null }).text ?? ''
    expect(text.startsWith('Hi,')).toBe(true)
  })
})
