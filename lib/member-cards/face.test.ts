import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FACE,
  cardEdition,
  faceRow,
  formatCardNumber,
  isOwnSiteLink,
  normalizeCardLink,
  normalizeFaceInput,
  readFace,
  tapTarget,
  type CardOwner,
} from './face'

const member: CardOwner = { kind: 'member', profileId: 'p1', handle: 'maya' }
const space: CardOwner = { kind: 'space', spaceId: 's1', slug: 'house-of-fates' }

describe('the tap decision', () => {
  it('opens the owner page when nothing is set (owner ruling 2026-10-22)', () => {
    expect(tapTarget(member, DEFAULT_FACE, 'p2')).toEqual({ to: 'page', path: '/people/maya' })
    expect(tapTarget(space, DEFAULT_FACE, null)).toEqual({ to: 'page', path: '/spaces/house-of-fates' })
  })
  it('shows a signed-out stranger the public card instead of a sign-in wall', () => {
    expect(tapTarget(member, DEFAULT_FACE, null)).toEqual({ to: 'face' })
  })
  it('shows nothing for a paused card, even to its owner', () => {
    expect(tapTarget(member, { ...DEFAULT_FACE, paused: true }, 'p1')).toEqual({ to: 'paused' })
  })
  it('sends the owner of a member card to their settings while it is still on its default', () => {
    expect(tapTarget(member, DEFAULT_FACE, 'p1')).toEqual({ to: 'owner_settings' })
    expect(tapTarget(space, DEFAULT_FACE, 'p1')).toEqual({ to: 'page', path: '/spaces/house-of-fates' })
  })
  it('lets the owner test a card they have set, like anyone else', () => {
    expect(tapTarget(member, { ...DEFAULT_FACE, mode: 'link', linkUrl: 'https://example.com/' }, 'p1')).toEqual({
      to: 'link',
      url: 'https://example.com/',
    })
    expect(tapTarget(member, { ...DEFAULT_FACE, mode: 'card' }, 'p1')).toEqual({ to: 'face' })
  })
  it('follows the chosen mode', () => {
    expect(tapTarget(member, { ...DEFAULT_FACE, mode: 'card' }, 'p2')).toEqual({ to: 'face' })
    expect(tapTarget(member, { ...DEFAULT_FACE, mode: 'link', linkUrl: 'https://example.com/' }, null)).toEqual({
      to: 'link',
      url: 'https://example.com/',
    })
  })
})

describe('links', () => {
  it('adds https to a bare domain and refuses anything else', () => {
    expect(normalizeCardLink('example.com/x')).toBe('https://example.com/x')
    expect(normalizeCardLink('http://example.com')).toBeNull()
    expect(normalizeCardLink('javascript:alert(1)')).toBeNull()
    expect(normalizeCardLink('localhost')).toBeNull()
    expect(normalizeCardLink('')).toBeNull()
  })
})

describe('the editor input', () => {
  it('needs a link for link mode', () => {
    expect(normalizeFaceInput({ mode: 'link' }, false)).toEqual({ error: 'Add the link your card should open.' })
  })
  it('refuses a bad link', () => {
    expect('error' in normalizeFaceInput({ mode: 'card', linkUrl: 'ftp://x' }, false)).toBe(true)
  })
  it('keeps the perk only for a Space', () => {
    const m = normalizeFaceInput({ cardholderPerk: 'Free tea' }, false)
    const s = normalizeFaceInput({ cardholderPerk: 'Free tea' }, true)
    expect('face' in m && m.face.cardholderPerk).toBe(null)
    expect('face' in s && s.face.cardholderPerk).toBe('Free tea')
    expect('error' in normalizeFaceInput({ cardholderPerk: 'x'.repeat(121) }, true)).toBe(true)
  })
  it('round-trips through the stored row', () => {
    const parsed = normalizeFaceInput({ mode: 'card', showPhone: true, swapBack: false }, false)
    if (!('face' in parsed)) throw new Error('expected a face')
    expect(readFace(faceRow(parsed.face))).toEqual(parsed.face)
  })
  it('reads a link-mode row with a broken link as page mode', () => {
    expect(readFace({ mode: 'link', link_url: 'nope' }).mode).toBe('page')
  })
})

describe('the printed card', () => {
  it('numbers and editions', () => {
    expect(formatCardNumber(42)).toBe('No. 0042')
    expect(formatCardNumber(null)).toBeNull()
    expect(cardEdition(1)).toBe('founders')
    expect(cardEdition(100)).toBe('founders')
    expect(cardEdition(101)).toBe('crew')
    expect(cardEdition(null)).toBe('crew')
  })
})

describe('isOwnSiteLink', () => {
  it('treats the apex and www as Frequency, and any other host as another site', () => {
    expect(isOwnSiteLink('https://www.frequencylocal.com/events', 'https://frequencylocal.com')).toBe(true)
    expect(isOwnSiteLink('https://frequencylocal.com/', 'https://frequencylocal.com')).toBe(true)
    expect(isOwnSiteLink('https://thegrouplocal.com/', 'https://frequencylocal.com')).toBe(false)
    expect(isOwnSiteLink('https://frequencylocal.com.evil.example/', 'https://frequencylocal.com')).toBe(false)
    expect(isOwnSiteLink('not a url', 'https://frequencylocal.com')).toBe(false)
  })
})
