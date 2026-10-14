import { describe, it, expect } from 'vitest'
import { data } from '@/lib/page-editor/templates/tools-for-community-builders'

// LIVE-912 (LAUNCH-MARKETING-PLAN §14 Phase 0.3): the software is "Frequency". "Frequency Labs" read
// as a second product, and The Lab is a 2028 plan, so nothing here offers to tour it today.
const text = JSON.stringify(data)

describe('tools-for-community-builders template copy (LIVE-912)', () => {
  it('names the software Frequency, never "Frequency Labs"', () => {
    expect(text).not.toMatch(/Frequency Labs|Labs toolkit/)
    expect(text).toContain('Frequency bundles the four jobs')
  })

  // 2026-10-14: /the-lab merged into /vision, and the Lab stays out of the builder wing entirely
  // (messaging.md: Labs are for the Vision page only), so this page no longer pitches or links it.
  it('never offers to tour The Lab, and no longer pitches it in the builder wing', () => {
    expect(text).not.toContain('Tour The Lab')
    expect(text).not.toContain('/the-lab')
    expect(text).not.toMatch(/plan for The Lab/)
  })
})
