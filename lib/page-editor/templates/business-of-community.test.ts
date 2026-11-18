import { describe, it, expect } from 'vitest'
import { BETA_ENDS_DAY_LABEL, FOUNDING_MEMBER_COPY } from '@/lib/core/launch-dates'
import { BOC_FAQ, data } from './business-of-community'

// The Certified review date is literal copy in an editable template. This keeps it on the beta clock.
describe('business-of-community template', () => {
  const date = `${BETA_ENDS_DAY_LABEL}, ${FOUNDING_MEMBER_COPY.endsOn.slice(0, 4)}`

  it('dates the free Certified review to the end of the beta', () => {
    const cost = BOC_FAQ.find((f) => f.q === 'What does it cost?')
    expect(cost?.a).toContain(`Certified review is free through ${date}, then comes with a paid Space.`)
  })

  it('never uses a dash or an exclamation point in its copy', () => {
    const text = JSON.stringify(data)
    expect(text).not.toMatch(/[\u2013\u2014!]/)
  })

  it('answers the seven questions the brief names', () => {
    expect(BOC_FAQ).toHaveLength(7)
  })
})
