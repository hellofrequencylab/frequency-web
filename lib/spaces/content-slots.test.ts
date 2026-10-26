import { describe, expect, it } from 'vitest'
import { bindSlots, readSlots, type SlotValues } from './content-slots'

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
