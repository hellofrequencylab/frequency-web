import { describe, expect, it } from 'vitest'
import { PREVIEW_KIT_ORDER } from '@/lib/theme/preview-tokens'
import {
  DRAFT_KEY, STEP_SEGMENTS, claimedHandle, emptyDraft, handleFromName, handleOf, hasProgress, initialOf, isValidHandle, nextOpenMove, parseDraft,
  progressOf, readStoredDraft, serializeDraft, startingModeFor, stepPrompt,
} from '@/lib/create-space/builder'

describe('handles', () => {
  it('follow the name until one is typed', () => {
    expect(handleFromName('Saltwater Collective')).toBe('saltwatercollective')
    expect(handleFromName('Café Ünder 9!')).toBe('cafeunder9')
    expect(handleOf({ name: '', slug: '' })).toBe('yourspace')
    expect(handleOf({ name: 'Studio', slug: 'mine' })).toBe('mine')
  })
  it('are claimed from the typed one or the name, never from the sample', () => {
    expect(claimedHandle({ name: 'Saltwater Collective', slug: '' })).toBe('saltwatercollective')
    expect(claimedHandle({ name: 'Studio', slug: 'mine' })).toBe('mine')
    expect(claimedHandle({ name: '!!!', slug: '' })).toBe('')
    expect(claimedHandle({ name: '', slug: '' })).toBe('')
  })
  it('accept single hyphens inside and nothing else', () => {
    expect(isValidHandle('river-studio')).toBe(true)
    expect(isValidHandle('-x')).toBe(false)
    expect(isValidHandle('a--b')).toBe(false)
    expect(isValidHandle('a')).toBe(false)
  })
})

describe('progress and the steps', () => {
  it('weighs the kit, the four moves and the save as the handoff lists them', () => {
    const d = emptyDraft('designer', true)
    expect(progressOf(d)).toBe(10)
    d.done.name = true
    expect(progressOf(d)).toBe(30)
    const all = { ...d, done: { name: true, offer: true, contact: true, photos: true } }
    expect(progressOf(all)).toBe(90)
    expect(progressOf(all, true)).toBe(100)
  })
  it('finds the next open move, wrapping round', () => {
    expect(nextOpenMove({ name: true, offer: false, contact: false, photos: false }, 0)).toBe(1)
    expect(nextOpenMove({ name: false, offer: true, contact: true, photos: true }, 3)).toBe(0)
    expect(nextOpenMove({ name: true, offer: true, contact: true, photos: true }, 2)).toBeNull()
  })
  it('has five segments and a prompt per step that names the kit on the photos step', () => {
    expect(STEP_SEGMENTS).toHaveLength(5)
    expect(stepPrompt(3, 'Designer')).toContain('Designer theme')
    expect(stepPrompt(4, 'Designer')).toContain('Nothing is public')
    expect(stepPrompt(9, 'Designer')).toBe('')
  })
})

describe('the tools a pick switches on', () => {
  it('is General with no pick, and follows the first pick otherwise', () => {
    expect(startingModeFor([]).label).toBe('General')
    expect(startingModeFor(['bookings']).label).toBe('Appointments')
    expect(startingModeFor(['community', 'products']).label).toBe('Shop')
    expect(startingModeFor(['bookings', 'donations']).label).toBe('Nonprofit')
  })
})

describe('the draft', () => {
  it('round-trips, and a draft on another kit is not resumed when one was chosen', () => {
    const [kit, other] = PREVIEW_KIT_ORDER
    const d = emptyDraft(kit, true)
    d.name = 'Clay Room'
    d.goals = ['events']
    d.offer = 'Weekly pottery classes.'
    d.email = 'sam@example.com'
    d.cover = 's2'
    d.logo = 'mono'
    d.profile = 'initials'
    d.startedAt = '2026-11-02T18:00:00.000Z'
    d.leadToken = 'abcdefgh12345678'
    expect(parseDraft(serializeDraft(d), null)).toEqual(d)
    expect(parseDraft(serializeDraft(d), other)).toBeNull()
    expect(parseDraft(serializeDraft(d), kit)?.goals).toEqual(['events'])
  })
  it('drops anything unexpected', () => {
    expect(parseDraft('not json', null)).toBeNull()
    expect(parseDraft(JSON.stringify({ kit: 'nope' }), null)).toBeNull()
    const d = parseDraft(JSON.stringify({ kit: PREVIEW_KIT_ORDER[0], goals: ['events', 'xx'], accentAt: -3, name: 7, cover: 'https://x', logo: 'drop', profile: 's99', startedAt: 'yesterday', leadToken: '<script>' }), null)
    expect(d?.goals).toEqual(['events'])
    expect(d?.accentAt).toBe(0)
    expect(d?.name).toBe('')
    expect(d?.cover).toBe('s0')
    expect(d?.logo).toBe('word')
    expect(d?.profile).toBe('s0')
    expect(d?.startedAt).toBeNull()
    expect(d?.leadToken).toBeNull()
  })
  it('upgrades a v1 draft: look becomes the accent pick, goals keep the offer step done, host becomes the host name', () => {
    const v1 = JSON.stringify({ kit: 'designer', kitChosen: true, accentAt: 2, name: 'Clay Room', slug: '', goals: ['events'], hostName: 'Sam', done: { name: true, look: true, goals: true, host: true } })
    const d = parseDraft(v1, null)!
    expect(d.accentPicked).toBe(true)
    expect(d.accentAt).toBe(2)
    expect(d.offer).toBe('')
    expect(d.done).toEqual({ name: true, offer: true, contact: false, photos: false })
    expect(d.hostName).toBe('Sam')
    const fresh = parseDraft(JSON.stringify({ kit: 'designer', goals: [], done: { name: true, look: false } }), null)!
    expect(fresh.accentPicked).toBe(false)
    expect(fresh.done.offer).toBe(false)
  })
  it('reads the v2 key first and falls back to the v1 key once', () => {
    const v2 = serializeDraft({ ...emptyDraft('designer', true), name: 'New' })
    const v1 = JSON.stringify({ kit: 'designer', name: 'Old', done: { look: true } })
    expect(readStoredDraft((k) => (k === DRAFT_KEY ? v2 : v1), null)?.name).toBe('New')
    expect(readStoredDraft((k) => (k === DRAFT_KEY ? null : v1), null)?.name).toBe('Old')
    expect(readStoredDraft(() => null, null)).toBeNull()
  })
  it('knows when there is something to come back to, and the initial for a monogram', () => {
    expect(hasProgress(emptyDraft('designer', false))).toBe(false)
    expect(hasProgress({ ...emptyDraft('designer', false), name: 'x' })).toBe(true)
    expect(initialOf('sam rivera', 'Clay')).toBe('S')
    expect(initialOf('', 'clay')).toBe('C')
    expect(initialOf('', '')).toBe('Y')
  })
})
