import { describe, expect, it } from 'vitest'
import { COLD_KIT, createSpaceDoorHref, doorArrival, goalsFromDoor } from './door'
import { NICHE_FUNNEL_DESTINATIONS } from '@/lib/funnels/definitions'
import { OPERATOR_CTA_HREF, operatorStartHref } from '@/lib/site'

// LIVE-1969: a signed-out arrival at /spaces/new opens /create-a-space with what the door knew.

const paramsOf = (href: string): Record<string, string> => Object.fromEntries(new URLSearchParams(href.split('?')[1] ?? ''))

describe('goalsFromDoor', () => {
  it('turns a door mode into the goal that starts that setup', () => {
    expect(goalsFromDoor('business:appointments', null)).toEqual(['bookings'])
    expect(goalsFromDoor('nonprofit:donations', null)).toEqual(['donations'])
  })
  it('keeps the calculator picks, in catalog order, deduped, and drops what it does not know', () => {
    expect(goalsFromDoor('business:ticketed', 'community,events,nope')).toEqual(['events', 'community'])
    expect(goalsFromDoor('business:nothing', 'x')).toEqual([])
  })
  it('reads the coaches and general doors, whose modes no goal starts, as bookings', () => {
    expect(goalsFromDoor('business:packages', null)).toEqual(['bookings'])
    expect(goalsFromDoor('business:service', null)).toEqual(['bookings'])
  })
})

describe('doorArrival', () => {
  it('starts cold with nothing', () => {
    expect(doorArrival(() => null)).toEqual({ kit: COLD_KIT, chosen: false, name: '', goals: [], niche: null })
  })
  it('reads the kit from ?kit= or /spaces/new\'s ?theme=, and ignores one it does not have', () => {
    expect(doorArrival((k) => (k === 'kit' ? 'designer' : null)).chosen).toBe(true)
    expect(doorArrival((k) => (k === 'theme' ? 'midnight' : null))).toMatchObject({ kit: 'midnight', chosen: true })
    expect(doorArrival((k) => (k === 'kit' ? 'network' : null))).toMatchObject({ kit: COLD_KIT, chosen: false })
  })
  it('takes the first of a repeated key, trims the name, and keeps only a real niche', () => {
    const a = doorArrival((k) => ({ name: ['  Limewell Studio  ', 'x'], niche: 'coaches', mode: 'business:membership' } as Record<string, string | string[]>)[k])
    expect(a.name).toBe('Limewell Studio')
    expect(a.goals).toEqual(['classes'])
    expect(a.niche).toBe('coaches')
    expect(doorArrival((k) => (k === 'niche' ? 'astronauts' : null)).niche).toBeNull()
  })
})

describe('createSpaceDoorHref', () => {
  it('is the plain page when the door knew nothing', () => {
    expect(createSpaceDoorHref({})).toBe('/create-a-space')
    expect(createSpaceDoorHref({ plan: 'business', next: '/x' })).toBe('/create-a-space')
  })
  it('carries only the hints the builder reads, cleaned', () => {
    const href = createSpaceDoorHref({ theme: 'designer', mode: 'business:appointments', intents: 'events,nope', niche: 'studios', name: ' Limewell ' })
    expect(href.startsWith('/create-a-space?')).toBe(true)
    expect(paramsOf(href)).toEqual({ kit: 'designer', mode: 'business:appointments', intents: 'events', niche: 'studios', name: 'Limewell' })
  })
  it('drops a mode no goal starts, so the address cannot carry text', () => {
    expect(createSpaceDoorHref({ mode: 'business:<script>' })).toBe('/create-a-space')
    expect(createSpaceDoorHref({ mode: 'business:nothing' })).toBe('/create-a-space')
  })
  it('reads back exactly what it wrote', () => {
    const params = { kit: 'midnight', mode: 'nonprofit:donations', niche: 'nonprofits', name: 'Hearth' }
    const a = doorArrival((k) => paramsOf(createSpaceDoorHref(params))[k] ?? null)
    expect(a).toEqual({ kit: 'midnight', chosen: true, name: 'Hearth', goals: ['donations'], niche: 'nonprofits' })
  })
})

describe('every signed-out door lands in the builder primed', () => {
  const doors = [
    ...Object.values(NICHE_FUNNEL_DESTINATIONS).map((d) => (d.mode === 'direct' ? d.url : '')),
    OPERATOR_CTA_HREF,
    operatorStartHref('business', { name: 'Hearth', intents: 'events' }),
  ].filter((h) => h.startsWith('/spaces/new'))

  it('the doors that open /spaces/new with a mode all name a goal the builder has', () => {
    for (const href of doors) {
      const p = paramsOf(href)
      if (!p.mode) continue
      expect(goalsFromDoor(p.mode, null), href).not.toEqual([])
      expect(paramsOf(createSpaceDoorHref(p)).mode, href).toBe(p.mode)
    }
  })
  it('the pricing hand-off keeps its name and picks', () => {
    const p = paramsOf(operatorStartHref('business', { name: 'Hearth', intents: 'events,community' }))
    expect(paramsOf(createSpaceDoorHref(p))).toEqual({ intents: 'events,community', name: 'Hearth' })
  })
})

describe('the accent picked beside a Use button', () => {
  it('opens the builder on it, by name or hex, and drops one the kit does not have', () => {
    expect(doorArrival((k) => ({ kit: 'cyberwitch', accent: 'absinthe' } as Record<string, string>)[k] ?? null).accentAt).toBe(1)
    expect(doorArrival((k) => ({ kit: 'cyberwitch', accent: '#1FF4FF' } as Record<string, string>)[k] ?? null).accentAt).toBe(2)
    expect(doorArrival((k) => ({ kit: 'cyberwitch', accent: 'volt' } as Record<string, string>)[k] ?? null).accentAt).toBeUndefined()
    expect(doorArrival((k) => ({ accent: 'absinthe' } as Record<string, string>)[k] ?? null).accentAt).toBeUndefined()
  })
  it('rides through the signed-out door and back', () => {
    const href = createSpaceDoorHref({ kit: 'cyberwitch', accent: 'Absinthe' })
    expect(href).toBe('/create-a-space?kit=cyberwitch&accent=absinthe')
    expect(doorArrival((k) => paramsOf(href)[k] ?? null).accentAt).toBe(1)
  })
})
