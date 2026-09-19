import { describe, it, expect } from 'vitest'
import { buildVeraProposal, recapDraft } from './vera-plan'

describe('buildVeraProposal', () => {
  it('never claims to publish', () => {
    const proposal = buildVeraProposal({
      pastTaskTitles: ['Print programs'],
      busyDayKeys: ['2026-10-04'],
      preferredWeekdays: [0],
      fromDayKey: '2026-09-20',
      gaps: ['Start'],
    })
    expect(proposal.checklist).toContain('Print programs')
    expect(proposal.suggestedDayKeys.every((d) => d !== '2026-10-04')).toBe(true)
    expect(proposal.nudges[0]).toContain('Start')
  })
})

describe('recapDraft', () => {
  it('labels itself a proposal', () => {
    expect(recapDraft({ title: 'Equinox', attendance: 12, ranLate: true })).toMatch(/Proposal/)
    expect(recapDraft({ title: 'Equinox', attendance: 12, ranLate: true })).toMatch(/Nothing here is published/)
  })
})
