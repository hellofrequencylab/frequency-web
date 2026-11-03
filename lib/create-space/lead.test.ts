import { describe, expect, it } from 'vitest'
import { emptyDraft } from '@/lib/create-space/builder'
import type { BuilderDraft } from '@/lib/create-space/builder'
import { LEAD_HOT_SCORE, isLeadToken, isZone, leadEmailOf, leadPayloadFor, leadScore, personasFor, stepReached } from '@/lib/create-space/lead'

const full = (): BuilderDraft => ({
  ...emptyDraft('designer', true),
  name: 'Limewell Studio',
  offer: 'Kitchen and home design for families who love to cook.',
  goals: ['bookings'],
  hostName: 'Sam Rivera',
  email: 'Sam@Example.com ',
  phone: '+1 555 014 2290',
  where: 'Lisbon',
  done: { name: true, offer: true, contact: true, photos: false },
})

describe('the lead behind a draft', () => {
  it('reads the address lowercased, or nothing', () => {
    expect(leadEmailOf(full())).toBe('sam@example.com')
    expect(leadEmailOf({ email: 'not an address' })).toBeNull()
    expect(leadEmailOf({ email: '' })).toBeNull()
  })

  it('is a practitioner unless the offer is about a venue', () => {
    expect(personasFor('Kitchen and home design for families who love to cook.')).toEqual(['practitioner'])
    expect(personasFor('A bright hall and two rooms for hire in the old town.')).toEqual(['partner'])
    expect(personasFor('Coworking desks and a venue for workshops.')).toEqual(['partner'])
  })

  it('scores the plan way: +10 email, +5 phone, +5 where, +10 offer, +5 own photo, +15 saved, +30 launched', () => {
    const d = full()
    expect(leadScore(d, { saved: false, ownPhoto: false })).toBe(30)
    expect(leadScore(d, { saved: true, ownPhoto: true })).toBe(50)
    expect(leadScore(d, { saved: true, ownPhoto: true, launched: true })).toBe(80)
    expect(leadScore({ ...d, email: '', phone: '', where: '', done: { ...d.done, offer: false } }, { saved: false, ownPhoto: false })).toBe(0)
    expect(LEAD_HOT_SCORE).toBe(60)
  })

  it('counts the furthest done move as the step reached', () => {
    expect(stepReached(full())).toBe(3)
    expect(stepReached({ done: { name: true, offer: false, contact: false, photos: false } })).toBe(1)
    expect(stepReached({ done: { name: false, offer: false, contact: false, photos: false } })).toBe(0)
  })

  it('accepts a browser zone and a resume token only in their shapes', () => {
    expect(isZone('Europe/Lisbon')).toBe(true)
    expect(isZone('America/Argentina/Buenos_Aires')).toBe(true)
    expect(isZone('Etc/GMT+1')).toBe(true)
    expect(isZone('../../x')).toBe(false)
    expect(isZone('a'.repeat(70))).toBe(false)
    expect(isLeadToken('abcDEF12_-xyz')).toBe(true)
    expect(isLeadToken('short')).toBe(false)
    expect(isLeadToken('has space here')).toBe(false)
  })

  it('builds the funnel payload the operator list reads, with no picture and the offer cut short', () => {
    const p = leadPayloadFor({ ...full(), offer: 'x'.repeat(200), slug: 'limewell' }, { saved: true, ownPhoto: true, tz: 'Europe/Lisbon' })
    expect(p.flow).toBe('create-a-space')
    expect(p.sequence).toBe('create_space')
    expect(p.personas).toEqual(['practitioner'])
    expect(p.intents).toEqual(['bookings'])
    expect(p.handle).toBe('limewell')
    expect(String(p.offer)).toHaveLength(160)
    expect(p.location).toBe('Lisbon')
    expect(p.step).toBe(3)
    expect(p.tz).toBe('Europe/Lisbon')
    expect(p.score).toBe(50)
    expect(Object.keys(p)).not.toContain('cover')
  })
})
