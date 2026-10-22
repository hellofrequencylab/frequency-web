import { describe, it, expect, vi, beforeEach } from 'vitest'

// The card face's stage line reads the member progress spine and fails safe to 'Newcomer'.

let progress: unknown = null
let fail = false

vi.mock('@/lib/member-progress', () => ({
  MEMBER_STAGES: [
    { key: 'newcomer', index: 0, label: 'Newcomer', tagline: '' },
    { key: 'finding_feet', index: 1, label: 'Finding your feet', tagline: '' },
    { key: 'regular', index: 2, label: 'Regular', tagline: '' },
    { key: 'established', index: 3, label: 'Established', tagline: '' },
    { key: 'anchor', index: 4, label: 'Anchor', tagline: '' },
  ],
  getCachedMemberProgress: async () => {
    if (fail) throw new Error('down')
    return progress
  },
}))

import { cardStageLabel, readCardStage } from './stage'

beforeEach(() => {
  progress = null
  fail = false
})

describe('cardStageLabel', () => {
  it('maps a stage key to its ladder label', () => {
    expect(cardStageLabel('regular')).toBe('Regular')
    expect(cardStageLabel('anchor')).toBe('Anchor')
  })

  it('reads an unknown or missing key as Newcomer', () => {
    expect(cardStageLabel('wizard')).toBe('Newcomer')
    expect(cardStageLabel(null)).toBe('Newcomer')
  })
})

describe('readCardStage', () => {
  it("returns the member's stage label", async () => {
    progress = { stage: { key: 'established', index: 3, label: 'Established' } }
    expect(await readCardStage('p1')).toBe('Established')
  })

  it('fails safe to Newcomer when the read throws', async () => {
    fail = true
    expect(await readCardStage('p1')).toBe('Newcomer')
  })

  it('fails safe to Newcomer for no profile', async () => {
    expect(await readCardStage('')).toBe('Newcomer')
  })
})

describe('the real ladder', () => {
  it('the mocked labels match lib/member-progress.ts', async () => {
    const real = await vi.importActual<typeof import('@/lib/member-progress')>('@/lib/member-progress')
    expect(real.MEMBER_STAGES.map((s) => s.label)).toEqual([
      'Newcomer',
      'Finding your feet',
      'Regular',
      'Established',
      'Anchor',
    ])
  })
})
