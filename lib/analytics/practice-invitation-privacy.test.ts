import { describe, expect, it } from 'vitest'
import { PRACTICE_SUPPORT_CHOICES, practiceInvitationFor } from '@/lib/practices/invitations'
import { pixelSafePath, pixelSafeProps, pixelSafeTitle, REDACTED_PAGE_TITLE } from './sanitize'

describe('practice exploration stays out of pixel paths and titles', () => {
  it.each(PRACTICE_SUPPORT_CHOICES)('redacts the $area category after the nested pillar segment', (choice) => {
    const invitation = practiceInvitationFor(choice.id)
    if (invitation?.kind !== 'explore') throw new Error('Expected an exploration door')
    expect(pixelSafePath(invitation.href)).toBe('/discover/practices/pillar/[slug]')
    expect(pixelSafeTitle(invitation.href, `${choice.area} Practices`)).toBe(REDACTED_PAGE_TITLE)
    expect(pixelSafeProps({ href: invitation.href, page_location: `https://frequencylocal.com${invitation.href}?source=private#notice` })).toEqual({
      href: '/discover/practices/pillar/[slug]',
      page_location: 'https://frequencylocal.com/discover/practices/pillar/[slug]',
    })
  })

  it('keeps generic library doors and previously redacted paths stable', () => {
    expect(pixelSafePath('/discover/practices')).toBe('/discover/practices')
    expect(pixelSafePath('/practices')).toBe('/practices')
    expect(pixelSafePath('/practices/quiet-breath')).toBe('/practices/[slug]')
    expect(pixelSafePath('/discover/practices/quiet-breath')).toBe('/discover/practices/[slug]')
    expect(pixelSafePath('/discover/practices/pillar/[slug]')).toBe('/discover/practices/pillar/[slug]')
    expect(pixelSafePath('/discover/practices/pillar/spirit?mood=quiet')).toBe('/discover/practices/pillar/[slug]')
  })
})
