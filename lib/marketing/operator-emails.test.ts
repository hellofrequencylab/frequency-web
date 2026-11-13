import { describe, expect, it } from 'vitest'
import { buildOperatorEmail, operatorFocus, OPERATOR_DAYS, type OperatorFocus } from './operator-emails'
import { PLAN_STORY } from '@/lib/pricing/plan-story'

const FOCI: OperatorFocus[] = ['packages', 'membership', 'ticketed', 'donations', 'venue', 'network', 'general']
const base = { to: 'a@example.com', greetingName: 'Sam', spaceName: 'Dune Yoga', spaceSlug: 'dune-yoga', baseUrl: 'https://frequencylocal.com' }

describe('operatorFocus', () => {
  it('reads what a Space runs from its type and Focus', () => {
    expect(operatorFocus('nonprofit', null)).toBe('donations')
    expect(operatorFocus('business', 'packages')).toBe('packages')
    expect(operatorFocus('business', 'membership')).toBe('membership')
    expect(operatorFocus('business', 'ticketed')).toBe('ticketed')
    expect(operatorFocus('business', null)).toBe('general')
    expect(operatorFocus(null, 'nope')).toBe('general')
    expect(operatorFocus('business', null, { kind: 'venue' })).toBe('venue')
    expect(operatorFocus('business', null, { hasChapters: true })).toBe('network')
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

  it('states the Crew requirement once, on day 0 only, from the one pricing line', () => {
    expect(buildOperatorEmail({ day: 0, focus: 'general', ...base }).text).toContain(PLAN_STORY.crewSpace)
    expect(buildOperatorEmail({ day: 1, focus: 'general', ...base }).text).not.toContain(PLAN_STORY.crewSpace)
    expect(buildOperatorEmail({ day: 3, focus: 'general', ...base }).text).not.toContain(PLAN_STORY.crewSpace)
    expect(buildOperatorEmail({ day: 7, focus: 'general', ...base }).text).not.toContain(PLAN_STORY.crewSpace)
  })

  it('greets without a name', () => {
    const text = buildOperatorEmail({ day: 0, focus: 'general', ...base, greetingName: null }).text ?? ''
    expect(text.startsWith('Hi,')).toBe(true)
  })
})

describe('buildOperatorEmail with a next step', () => {
  const next = { id: 'sc-tag', label: 'Write your tagline', href: '/launch/step/space', why: 'One line is all a stranger reads before they decide to stay or go.' }

  for (const day of [1, 3, 7] as const) {
    it(`day ${day}: names the step, buttons to its address, keeps the plain-copy rules`, () => {
      const e = buildOperatorEmail({ day, focus: 'membership', ...base, next })
      expect(e.text).toContain('Next up: Write your tagline.')
      expect(e.text).toContain(next.why)
      expect(e.text).toContain('Write your tagline: https://frequencylocal.com/launch/step/space')
      expect(e.html).toContain('href="https://frequencylocal.com/launch/step/space"')
      expect(`${e.subject} ${e.text}`).not.toMatch(/[!—–]/)
    })
  }

  it('leaves day 0 as the fixed copy, and ignores a next step with an outside address', () => {
    expect(buildOperatorEmail({ day: 0, focus: 'general', ...base, next }).text).not.toContain('Next up')
    expect(buildOperatorEmail({ day: 1, focus: 'general', ...base, next: { ...next, href: 'https://evil.example' } }).text).not.toContain('Next up')
  })
})
