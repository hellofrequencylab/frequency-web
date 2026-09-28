import { describe, expect, it } from 'vitest'
import {
  incomingFromRow,
  incomingWords,
  isActiveShare,
  mapPlanShareRow,
  parseShareAnswer,
  planShareStatus,
  shareOptions,
  shareStateWords,
  type PlanShareRow,
} from './plan-shares'

// THE HANDSHAKE VOCABULARY (PROG-CAL7, LIVE-541). A guest may answer accepted or declined and
// nothing else; the picker offers accepted collaborators minus the Spaces that already hold an
// active share; the words a person reads are plain and never a long dash.

const row = (over: Partial<PlanShareRow> = {}): PlanShareRow => ({
  id: 'share-1',
  plan_id: 'plan-1',
  guest_space_id: 'space-b',
  status: 'pending',
  requested_by: 'profile-1',
  created_at: '2026-09-28T10:00:00Z',
  responded_at: null,
  responded_by: null,
  ...over,
})

describe('parseShareAnswer', () => {
  it('admits the two answers a guest may give and refuses the rest, revoke included', () => {
    expect(parseShareAnswer('accepted')).toBe('accepted')
    expect(parseShareAnswer('declined')).toBe('declined')
    expect(parseShareAnswer('revoked')).toBeNull()
    expect(parseShareAnswer('pending')).toBeNull()
    expect(parseShareAnswer('')).toBeNull()
    expect(parseShareAnswer(undefined)).toBeNull()
  })

  it('reads a stored status and falls back to pending on nonsense', () => {
    expect(planShareStatus('declined')).toBe('declined')
    expect(planShareStatus('lost')).toBeNull()
    expect(mapPlanShareRow(row({ status: 'lost' }), 'The Green Room').status).toBe('pending')
  })
})

describe('shareOptions', () => {
  const collaborators = [
    { id: 'space-c', name: 'The Workshop' },
    { id: 'space-b', name: 'The Green Room' },
    { id: 'space-d', name: 'Annex' },
  ]

  it('offers accepted collaborators by name, sorted, minus those already holding an active share', () => {
    const shares = [mapPlanShareRow(row({ guest_space_id: 'space-b', status: 'pending' }), 'The Green Room')]
    expect(shareOptions(collaborators, shares)).toEqual([
      { value: 'space-d', label: 'Annex' },
      { value: 'space-c', label: 'The Workshop' },
    ])
  })

  it('offers a Space again once its share was declined or taken back', () => {
    const declined = [mapPlanShareRow(row({ guest_space_id: 'space-b', status: 'declined' }), null)]
    expect(shareOptions(collaborators, declined).map((o) => o.value)).toEqual(['space-d', 'space-b', 'space-c'])
    expect(isActiveShare('revoked')).toBe(false)
    expect(isActiveShare('accepted')).toBe(true)
  })

  it('is empty with no collaborators, whatever the shares say', () => {
    expect(shareOptions([], [])).toEqual([])
  })
})

describe('the words', () => {
  it('say the state plainly, with no long dash and no exclamation', () => {
    for (const s of ['pending', 'accepted', 'declined', 'revoked'] as const) {
      expect(shareStateWords(s)).not.toMatch(/[–—!]/)
    }
    expect(shareStateWords('pending')).toBe('Waiting for their answer')
    expect(shareStateWords('revoked')).toBe('Taken back')
  })

  it('name the host and the Plan when the server resolved them, and stay honest when it could not', () => {
    const resolved = incomingFromRow(row(), { title: 'Autumn retreat', hostSpaceId: 'space-a', hostName: 'The Green Room' })
    expect(incomingWords(resolved)).toBe('The Green Room wants to work "Autumn retreat" with you.')
    const bare = incomingFromRow(row(), undefined)
    expect(bare.planTitle).toBeNull()
    expect(incomingWords(bare)).toBe('A Space you collaborate with wants to work a Plan with you.')
  })
})
