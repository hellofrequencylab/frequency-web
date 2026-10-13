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

  it('points at The Lab as a plan, not a place to tour', () => {
    expect(text).not.toContain('Tour The Lab')
    expect(text).toMatch(/plan for The Lab[^"]*2028/)
  })
})
