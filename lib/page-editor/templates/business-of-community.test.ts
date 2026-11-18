import { describe, it, expect } from 'vitest'
import { BOC_FAQ, data } from './business-of-community'

// The Certified review window is literal copy in an editable template (owner 2026-11-17: free for Community
// Books submitted by February 28, 2027, the January launch workshop's window).
describe('business-of-community template', () => {

  it('dates the free Certified review to the January workshop window', () => {
    const cost = BOC_FAQ.find((f) => f.q === 'What does it cost?')
    expect(cost?.a).toContain('Certified review is free for Community Books submitted by February 28, 2027, then comes with the Business plan.')
  })

  it('never uses a dash or an exclamation point in its copy', () => {
    const text = JSON.stringify(data)
    expect(text).not.toMatch(/[\u2013\u2014!]/)
  })

  it('answers the eight workshop questions', () => {
    expect(BOC_FAQ).toHaveLength(8)
  })
})
