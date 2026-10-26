import { describe, expect, it } from 'vitest'
import { bindSlots, keepSlotTokens, readSlots, type SlotValues } from './content-slots'

const resolveSlotText = (value: string, slots: SlotValues) => bindSlots(value, slots)
const resolveSlot = (saved: string | undefined, kit: string | undefined) => {
  const out = bindSlots('{{story|' + (kit ?? '') + '}}', saved === undefined ? {} : { story: saved })
  return out === '' ? undefined : out
}

const content = {
  aboutShort: '  A calm studio by the sea.  ',
  identity: { name: 'Salt Studio', tagline: 'Slow down here.' },
  profile: { about: 'We started in a garage.', email: 'hi@salt.test', phone: '', address: '1 Pier Rd' },
}

describe('readSlots', () => {
  it('reads each slot from the shared content record and trims it', () => {
    expect(readSlots(content)).toEqual({
      name: 'Salt Studio', tagline: 'Slow down here.', intro: 'A calm studio by the sea.',
      story: 'We started in a garage.', email: 'hi@salt.test', address: '1 Pier Rd',
    })
  })
  it('drops blank slots and survives a malformed record', () => {
    expect(readSlots(undefined)).toEqual({})
    expect(readSlots('nope')).toEqual({})
    expect(readSlots({ identity: { name: '  ' }, profile: [] })).toEqual({})
  })
})

describe('resolution order: saved, then kit copy, then block default', () => {
  it('prefers saved content', () => expect(resolveSlot('Saved', 'Kit')).toBe('Saved'))
  it('falls back to kit copy', () => expect(resolveSlot(undefined, 'Kit')).toBe('Kit'))
  it('leaves the block default to the block when both are empty', () => expect(resolveSlot('  ', undefined)).toBeUndefined())
})

describe('resolveSlotText', () => {
  it('draws the saved fact, else the kit copy after the bar, else nothing', () => {
    expect(resolveSlotText('{{tagline|Sample}}', { tagline: 'Real' })).toBe('Real')
    expect(resolveSlotText('{{tagline|Sample}}', {})).toBe('Sample')
    expect(resolveSlotText('{{tagline}}', {})).toBe('')
  })
  it('works inside a longer sentence and with several tokens', () => {
    expect(resolveSlotText('Hi, {{name|friend}}. {{tagline|Welcome.}}', { name: 'Salt' })).toBe('Hi, Salt. Welcome.')
  })
  it('leaves an unknown slot name visible', () => {
    expect(resolveSlotText('{{nmae|x}}', { name: 'Salt' })).toBe('{{nmae|x}}')
  })
})

describe('bindSlots', () => {
  it('resolves tokens at any depth without mutating the input', () => {
    const props = { title: 'Plain', cards: [{ body: '{{intro|Sample intro}}' }], nested: { deep: ['{{name}}'] } }
    const before = JSON.stringify(props)
    const out = bindSlots(props, { intro: 'Real intro', name: 'Salt' })
    expect(out).toEqual({ title: 'Plain', cards: [{ body: 'Real intro' }], nested: { deep: ['Salt'] } })
    expect(JSON.stringify(props)).toBe(before)
  })
  it('returns the same object when nothing carries a token', () => {
    const props = { title: 'Plain', cards: [{ body: 'Words' }], n: 3, on: true, none: null }
    expect(bindSlots(props, { name: 'Salt' })).toBe(props)
  })
  it('keeps text an owner typed over a token', () => {
    expect(bindSlots({ lead: 'My own words.' }, { story: 'Saved story' })).toEqual({ lead: 'My own words.' })
  })
})

describe('keepSlotTokens', () => {
  const stored = { title: '{{name|Your name}}', body: '{{story|Sample}}', cards: [{ t: '{{tagline|x}}' }, { t: 'Own' }] }
  const slots = { name: 'Salt', story: 'Saved story', tagline: 'Slow down' }
  const bound = bindSlots(stored, slots)
  it('keeps every token when nothing changed', () => expect(keepSlotTokens(stored, bound, structuredClone(bound))).toEqual(stored))
  it('replaces only the field the owner changed', () => {
    expect(keepSlotTokens(stored, bound, { ...bound, title: 'My title' })).toEqual({ ...stored, title: 'My title' })
  })
  it('keeps the other cards tokens when one card changes', () => {
    const next = { ...bound, cards: [{ t: 'Slow down' }, { t: 'Edited' }] }
    expect(keepSlotTokens(stored, bound, next)).toEqual({ ...stored, cards: [{ t: '{{tagline|x}}' }, { t: 'Edited' }] })
  })
})

describe('offers, photos and people', () => {
  const rich = {
    identity: { name: 'Salt', logoUrl: 'https://img.test/logo.png', coverUrl: 'https://img.test/cover.jpg' },
    profile: { offerings: [{ title: 'Private', visibility: 'private' }, { title: 'Sunrise class', blurb: 'Start slow.', price: 20, priceModel: 'fixed' }, { title: 'Retreat', priceModel: 'free' }] },
    team: [{ name: 'Ana', role: 'admin', avatarUrl: 'https://img.test/ana.jpg' }, { name: '@bo', role: 'editor', avatarUrl: null }],
  }
  it('reads the logo, the cover, the listed offers in order and the team', () => {
    const slots = readSlots(rich)
    expect(slots.logo).toBe('https://img.test/logo.png')
    expect(slots.cover).toBe('https://img.test/cover.jpg')
    expect(slots.offer1Title).toBe('Sunrise class')
    expect(slots.offer1Blurb).toBe('Start slow.')
    expect(slots.offer1Price).toBe('$20')
    expect(slots.offer2Title).toBe('Retreat')
    expect(slots.offer3Title).toBeUndefined()
    expect(slots.person1Name).toBe('Ana')
    expect(slots.person1Photo).toBe('https://img.test/ana.jpg')
    expect(slots.person2Name).toBe('@bo')
    expect(slots.person2Photo).toBeUndefined()
  })
  it('lets a kit name them with sample words until the Space has some', () => {
    expect(bindSlots('{{offer1Title|Your first offer}}', {})).toBe('Your first offer')
    expect(bindSlots('{{offer1Title|Your first offer}}', readSlots(rich))).toBe('Sunrise class')
  })
})

describe('schedule and call to action', () => {
  const record = {
    identity: { primaryCta: { label: 'Book a session', href: '/spaces/salt/book' } },
    events: [{ title: 'Full moon circle', startsAt: '2026-11-07T18:30:00.000Z', timeZone: 'America/Los_Angeles', location: 'Salt Studio, Encinitas' }, { title: 'Breathwork', startsAt: 'nope' }],
  }
  it('reads the button and the next events with the when-line the Events block draws', () => {
    const slots = readSlots(record)
    expect(slots.ctaLabel).toBe('Book a session')
    expect(slots.ctaHref).toBe('/spaces/salt/book')
    expect(slots.event1Title).toBe('Full moon circle')
    expect(slots.event1When).toMatch(/Nov 7/)
    expect(slots.event1Place).toBe('Salt Studio, Encinitas')
    expect(slots.event2Title).toBe('Breathwork')
    expect(slots.event2When).toBeUndefined()
    expect(slots.event3Title).toBeUndefined()
  })
})
