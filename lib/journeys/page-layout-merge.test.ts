import { describe, expect, it } from 'vitest'
import { mergePageLayout } from './page-layout-merge'
import { readJourneyOutcomes, writeJourneyOutcomes } from './outcomes'
import { readWizardState, writeWizardState, newWizardState } from './wizard'

describe('mergePageLayout (JRN-001)', () => {
  it('keeps the story settings and the wizard row when the layout control saves', () => {
    let stored = writeJourneyOutcomes([{ id: 'story', enabled: true }, { id: 'path', enabled: true }], ['Sleep better'])
    stored = writeWizardState(stored, { ...newWizardState(), completed: ['shape'] })
    const next = mergePageLayout(stored, [{ id: 'path', enabled: true }, { id: 'story', enabled: false }])
    expect(readJourneyOutcomes(next)).toEqual(['Sleep better'])
    expect(readWizardState(next)?.completed).toEqual(['shape'])
    expect(next.slice(0, 2).map((e) => [e.id, e.enabled])).toEqual([['path', true], ['story', false]])
  })

  it('keeps stored widgets the save did not name, in their stored order', () => {
    const next = mergePageLayout(
      [{ id: 'next-step', enabled: true }, { id: 'streak', enabled: false }, { id: 'story', enabled: true }],
      [{ id: 'story', enabled: false }],
    )
    expect(next.map((e) => e.id)).toEqual(['story', 'next-step', 'streak'])
    expect(next.find((e) => e.id === 'streak')?.enabled).toBe(false)
  })

  it('handles an empty stored config', () => {
    expect(mergePageLayout(null, [{ id: 'path', enabled: true }])).toEqual([{ id: 'path', enabled: true }])
  })
})
