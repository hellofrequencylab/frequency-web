import { describe, expect, it } from 'vitest'
import { PILLAR_SLUGS } from '@/lib/pillars/slugs'
import { PRACTICE_SUPPORT_CHOICES, practiceInvitationFor } from './invitations'

describe('explicit practice invitations', () => {
  it('offers each canonical support area once, without ranking a person', () => {
    expect(PRACTICE_SUPPORT_CHOICES.map((choice) => choice.id)).toEqual(PILLAR_SLUGS)
    expect(new Set(PRACTICE_SUPPORT_CHOICES.map((choice) => choice.label)).size).toBe(4)
  })

  it.each(PILLAR_SLUGS)('gives %s an existing public library destination without personal query parameters', (area) => {
    const invitation = practiceInvitationFor(area)
    expect(invitation?.kind).toBe('explore')
    if (invitation?.kind !== 'explore') throw new Error('Expected an exploration door')
    const url = new URL(invitation.href, 'https://frequencylocal.com')
    expect(url.origin).toBe('https://frequencylocal.com')
    expect(url.pathname).toBe(`/discover/practices/pillar/${area}`)
    expect(url.search).toBe('')
    expect(url.hash).toBe('')
    expect(invitation.action).toMatch(/^Explore .* practices$/)
  })

  it.each([null, undefined, '', 'Mind', ' mind', 'mind ', '__proto__', 'constructor', {}, [], ['mind'], 0, 'low-spirit', 'https://example.com', 'mind?email=someone'])('rejects an unrecognized choice %j', (choice) => {
    expect(practiceInvitationFor(choice)).toBeNull()
  })

  it('treats rest as an acknowledgement with no fabricated practice destination or activity', () => {
    expect(practiceInvitationFor('rest')).toEqual({
      kind: 'rest',
      message: 'You can leave room for rest today. There is nothing to log here. Come back when something feels useful.',
    })
  })

  it('offers a familiar-practice door that does not depend on a missing adopted-list anchor', () => {
    expect(practiceInvitationFor('familiar')).toMatchObject({ kind: 'explore', href: '/practices' })
  })

  it('does not let a caller modify subsequent destinations', () => {
    const first = practiceInvitationFor('mind')
    if (first?.kind !== 'explore') throw new Error('Expected an exploration door')
    first.href = 'https://example.com'
    expect(practiceInvitationFor('mind')).toMatchObject({ href: '/discover/practices/pillar/mind' })
  })
})
