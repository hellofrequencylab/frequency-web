import { describe, expect, it } from 'vitest'
import { countVoters, parseTimeVote, rankTimeOptions, tallyLine, timeVoteNoticeLine, voterKey, type TimeVoteRow } from './time-votes'

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const C = '00000000-0000-4000-8000-00000000000c'
const options = [
  { entryId: A, startsAt: '2026-12-05T19:00:00Z', whenLabel: 'Fri, Dec 5' },
  { entryId: B, startsAt: '2026-12-06T19:00:00Z', whenLabel: 'Sat, Dec 6' },
  { entryId: C, startsAt: '2026-12-07T19:00:00Z', whenLabel: 'Sun, Dec 7' },
]
const vote = (entry_id: string, who: string, choice: TimeVoteRow['choice']): TimeVoteRow => ({
  entry_id,
  voter_profile_id: who.includes('@') ? null : who,
  voter_email: who.includes('@') ? who : null,
  voter_name: null,
  choice,
})

describe('rankTimeOptions', () => {
  it('puts the option with the most yes first and calls it best', () => {
    const r = rankTimeOptions(options, [vote(A, 'p1', 'no'), vote(B, 'p1', 'yes'), vote(B, 'p2', 'yes'), vote(C, 'p2', 'yes')])
    expect(r.map((t) => t.entryId)).toEqual([B, C, A])
    expect(r[0].best).toBe(true)
    expect(r[0].rank).toBe(1)
    expect(r[1].best).toBe(false)
  })

  it('breaks a yes tie on if need be, then on fewest no', () => {
    const r = rankTimeOptions(options, [
      vote(A, 'p1', 'yes'),
      vote(A, 'p2', 'no'),
      vote(B, 'p1', 'yes'),
      vote(B, 'p2', 'maybe'),
      vote(C, 'p1', 'yes'),
    ])
    expect(r.map((t) => t.entryId)).toEqual([B, C, A])
  })

  it('sinks an option the required person said no to, whatever the counts', () => {
    const r = rankTimeOptions(options, [vote(A, 'lead', 'no'), vote(A, 'p1', 'yes'), vote(A, 'p2', 'yes'), vote(B, 'p1', 'maybe')], {
      required: [voterKey({ voter_profile_id: 'lead', voter_email: null })],
    })
    expect(r[r.length - 1].entryId).toBe(A)
    expect(r[r.length - 1].requiredNo).toBe(true)
    expect(r[0].entryId).toBe(B)
  })

  it('reads earliest first and calls nothing best before anyone votes', () => {
    const r = rankTimeOptions(options, [])
    expect(r.map((t) => t.entryId)).toEqual([A, B, C])
    expect(r.some((t) => t.best)).toBe(false)
  })

  it('counts an email voter and a member alike, marks the caller, and ignores votes on other dates', () => {
    const r = rankTimeOptions(options, [vote(B, 'venue@example.com', 'yes'), vote(B, 'me', 'maybe'), vote('elsewhere', 'p9', 'yes')], {
      me: voterKey({ voter_profile_id: 'me', voter_email: null }),
    })
    const b = r.find((t) => t.entryId === B)!
    expect(b.yes).toBe(1)
    expect(b.maybe).toBe(1)
    expect(b.mine).toBe('maybe')
    expect(b.names.yes).toEqual(['venue@example.com'])
  })

  it('keeps one answer per voter per option', () => {
    const r = rankTimeOptions(options, [vote(A, 'p1', 'no'), vote(A, 'p1', 'yes')])
    expect(r.find((t) => t.entryId === A)).toMatchObject({ yes: 1, no: 0, answered: 1 })
  })
})

describe('the words', () => {
  it('prints a tally and the owner notice plainly', () => {
    expect(tallyLine({ yes: 3, maybe: 1, no: 0 })).toBe('3 yes · 1 if need be')
    expect(tallyLine({ yes: 0, maybe: 0, no: 0 })).toBe('No answers yet')
    expect(timeVoteNoticeLine('Dana', 'Spring Market', 'maybe', 'Sat, Dec 6')).toBe(
      'Dana answered Find a time on Spring Market: if need be to Sat, Dec 6.',
    )
  })

  it('counts each voter once', () => {
    expect(countVoters([vote(A, 'p1', 'yes'), vote(B, 'p1', 'no'), vote(A, 'x@y.z', 'yes')])).toBe(2)
  })
})

describe('parseTimeVote', () => {
  it('accepts an answer, a take-back, and refuses the rest', () => {
    expect(parseTimeVote({ entryId: A, choice: 'yes' })).toEqual({ entryId: A, choice: 'yes' })
    expect(parseTimeVote({ entryId: A, choice: null })).toEqual({ entryId: A, choice: null })
    expect(parseTimeVote({ entryId: A, choice: 'sure' })).toEqual({ error: 'Answer Yes, If need be or No.' })
    expect(parseTimeVote({ entryId: 'x', choice: 'yes' })).toEqual({ error: 'That date is no longer an option.' })
    expect(parseTimeVote(null)).toEqual({ error: 'There was no answer to save.' })
  })
})
