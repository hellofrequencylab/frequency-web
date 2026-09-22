import { describe, it, expect } from 'vitest'
import { buildVeraProposal, proposePlanChecklist, readinessNudges, recapDraft } from './vera-plan'

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

  it('a suggestion never lands on a busy day, whatever the busy set holds', () => {
    // Every Sunday from Sep 20 for six weeks is busy; the first free Sunday after that is Nov 1.
    const busyDayKeys = ['2026-09-27', '2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25']
    const proposal = buildVeraProposal({
      pastTaskTitles: [],
      busyDayKeys,
      preferredWeekdays: [0],
      fromDayKey: '2026-09-20',
      gaps: [],
    })
    expect(proposal.suggestedDayKeys.length).toBeGreaterThan(0)
    for (const day of proposal.suggestedDayKeys) expect(busyDayKeys).not.toContain(day)
    expect(proposal.suggestedDayKeys[0]).toBe('2026-11-01')
  })

  it('renders the recap from a real count when one is handed in', () => {
    const proposal = buildVeraProposal({
      pastTaskTitles: [],
      busyDayKeys: [],
      preferredWeekdays: [],
      fromDayKey: '2026-09-20',
      gaps: [],
      recap: { title: 'Equinox', attendance: 12 },
    })
    expect(proposal.recap).toContain('12 people came')
    expect(proposal.recap).not.toContain('not recorded')
  })
})

describe('recapDraft', () => {
  it('labels itself a proposal', () => {
    expect(recapDraft({ title: 'Equinox', attendance: 12 })).toMatch(/Proposal/)
    expect(recapDraft({ title: 'Equinox', attendance: 12 })).toMatch(/Nothing here is published/)
  })

  it('says the record is empty only when the count is null, and counts one person in the singular', () => {
    expect(recapDraft({ title: 'Equinox', attendance: null })).toContain('Attendance was not recorded.')
    expect(recapDraft({ title: 'Equinox', attendance: 1 })).toContain('1 person came.')
    expect(recapDraft({ title: 'Equinox', attendance: 0 })).toContain('0 people came.')
  })

  it('makes no promise about running late: nothing in the record can say so', () => {
    expect(recapDraft({ title: 'Equinox', attendance: 3 })).not.toMatch(/late/i)
  })
})

describe('every string goes through the house voice (lib/ai/voice.ts)', () => {
  it('strips em dashes and exclamation points from copy it did not write', () => {
    expect(proposePlanChecklist(['Book the room \u2014 today!'])).toEqual(['Book the room, today.'])
    expect(readinessNudges(['a date \u2013 any date'])).toEqual(['Still needed: a date, any date.'])
    expect(recapDraft({ title: 'Equinox \u2014 fall', attendance: 2 })).toBe(
      'Proposal for Equinox, fall: 2 people came. Nothing here is published.',
    )
  })
})
