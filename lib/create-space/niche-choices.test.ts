import { describe, expect, it } from 'vitest'
import { getFunnelConfig } from '@/lib/marketing/funnel-config'
import { NICHE_FUNNEL_DESTINATIONS } from '@/lib/funnels/definitions'
import { buildNicheChoices, mergeNicheGoals, resolveNicheSeed } from './niche-choices'

const choices = () => buildNicheChoices(getFunnelConfig, NICHE_FUNNEL_DESTINATIONS)
const expected = [
  ['coaches-and-healers', 'coaches', 'business:packages', ['bookings']],
  ['studios', 'studios', 'business:membership', ['classes']],
  ['event-hosts', 'hosts', 'business:ticketed', ['events']],
  ['venues', 'venues', 'business:ticketed', ['events']],
  ['nonprofits', 'nonprofits', 'nonprofit:donations', ['donations']],
  ['networks', 'networks', 'business:membership', ['classes']],
  ['local-businesses', 'general', 'business:service', ['bookings']],
  ['clubs-and-groups', 'clubs', 'business:membership', ['classes']],
  ['spiritual-community', 'faith', 'nonprofit:donations', ['donations']],
] as const

describe('nine onboarding niche choices', () => {
  it.each(expected)('derives %s from its authoritative door and destination', (slug, niche, mode, goals) => {
    const choice = choices().find((row) => row.slug === slug)
    expect(choice).toMatchObject({ slug, niche, mode, goals })
    expect(choice?.niche).toBe(getFunnelConfig(slug)?.niche)
    const destination = NICHE_FUNNEL_DESTINATIONS[niche]
    expect(new URL(destination.mode === 'direct' ? destination.url : '', 'https://frequencylocal.com').searchParams.get('mode')).toBe(choice?.mode)
    expect(resolveNicheSeed(choices(), slug)).toEqual({ niche, mode, goals })
    expect(resolveNicheSeed(choices(), niche)).toEqual({ niche, mode, goals })
  })
  it('keeps exactly the nine requested doors in their prescribed order', () => {
    expect(choices().map((row) => row.slug)).toEqual(expected.map(([slug]) => slug))
  })
  it.each([null, undefined, '', 'coaches-and-healers/extra', 'Coaches', ' coaches', 'astronauts', 'creators', '__proto__', {}, ['coaches']])('drops unknown or malformed niche %j', (raw) => {
    expect(resolveNicheSeed(choices(), raw)).toBeNull()
  })
  it('retains an explicitly requested registered mode over the niche default', () => {
    expect(resolveNicheSeed(choices(), 'coaches', 'business:membership')).toEqual({ niche: 'coaches', mode: 'business:membership', goals: ['classes'] })
  })
  it.each(['business:missing', 'business:donations', 'https://evil.test', {}, ['business:membership']])('ignores malformed explicit mode %j', (mode) => {
    expect(resolveNicheSeed(choices(), 'coaches', mode)).toEqual({ niche: 'coaches', mode: 'business:packages', goals: ['bookings'] })
  })
  it('unions typed goals with the niche seed without replacing its identity or exact mode', () => {
    const seed = resolveNicheSeed(choices(), 'coaches')!
    expect(mergeNicheGoals(seed.goals, ['events', 'bookings', 'nope'])).toEqual(['bookings', 'events'])
    expect(seed).toEqual({ niche: 'coaches', mode: 'business:packages', goals: ['bookings'] })
  })
  it('uses an explicit chip choice default instead of a previous URL mode when no override is passed', () => {
    expect(resolveNicheSeed(choices(), 'coaches')).toEqual({ niche: 'coaches', mode: 'business:packages', goals: ['bookings'] })
  })
  it('fails closed when an authoritative bridge is missing or unsafe', () => {
    expect(buildNicheChoices(() => undefined, NICHE_FUNNEL_DESTINATIONS)).toEqual([])
    expect(buildNicheChoices(getFunnelConfig, {})).toEqual([])
    const invalid = { coaches: { mode: 'direct', url: 'https://evil.test/spaces/new?mode=business:packages' } }
    expect(buildNicheChoices(getFunnelConfig, invalid)).toEqual([])
    expect(buildNicheChoices(() => ({ niche: '__proto__' }), NICHE_FUNNEL_DESTINATIONS)).toEqual([])
  })
})
