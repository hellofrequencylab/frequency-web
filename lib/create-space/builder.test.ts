import { describe, expect, it } from 'vitest'
import { PREVIEW_KIT_ORDER } from '@/lib/theme/preview-tokens'
import {
  emptyDraft, handleFromName, handleOf, isValidHandle, meterOf, nextOpenMove, parseDraft, progressOf, serializeDraft,
  startingModeFor, trackFraction,
} from '@/lib/create-space/builder'

describe('handles', () => {
  it('follow the name until one is typed', () => {
    expect(handleFromName('Saltwater Collective')).toBe('saltwatercollective')
    expect(handleFromName('Café Ünder 9!')).toBe('cafeunder9')
    expect(handleOf({ name: '', slug: '' })).toBe('yourspace')
    expect(handleOf({ name: 'Studio', slug: 'mine' })).toBe('mine')
  })
  it('accept single hyphens inside and nothing else', () => {
    expect(isValidHandle('river-studio')).toBe(true)
    expect(isValidHandle('-x')).toBe(false)
    expect(isValidHandle('a--b')).toBe(false)
    expect(isValidHandle('a')).toBe(false)
  })
})

describe('progress and the meter', () => {
  it('weighs the moves and lights the first open stop', () => {
    const d = emptyDraft('designer', true)
    expect(progressOf(d)).toBe(15)
    d.done.name = true
    expect(progressOf(d)).toBe(40)
    const meter = meterOf(d, true)
    expect(meter.map((m) => m.on)).toEqual([true, true, false, false, false])
    expect(meter.findIndex((m) => m.now)).toBe(2)
    expect(trackFraction(meter)).toBe(0.25)
  })
  it('finds the next open move, wrapping round', () => {
    expect(nextOpenMove({ name: true, look: false, goals: false, host: false }, 0)).toBe(1)
    expect(nextOpenMove({ name: false, look: true, goals: true, host: true }, 3)).toBe(0)
    expect(nextOpenMove({ name: true, look: true, goals: true, host: true }, 2)).toBeNull()
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
    const d = emptyDraft('temple', true)
    d.name = 'Clay Room'
    d.goals = ['events']
    expect(parseDraft(serializeDraft(d), null)?.name).toBe('Clay Room')
    expect(parseDraft(serializeDraft(d), 'designer')).toBeNull()
    expect(parseDraft(serializeDraft(d), 'temple')?.goals).toEqual(['events'])
  })
  it('drops anything unexpected', () => {
    expect(parseDraft('not json', null)).toBeNull()
    expect(parseDraft(JSON.stringify({ kit: 'nope' }), null)).toBeNull()
    const d = parseDraft(JSON.stringify({ kit: PREVIEW_KIT_ORDER[0], goals: ['events', 'xx'], accentAt: -3, name: 7 }), null)
    expect(d?.goals).toEqual(['events'])
    expect(d?.accentAt).toBe(0)
    expect(d?.name).toBe('')
  })
})
