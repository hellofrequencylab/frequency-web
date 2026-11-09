import { describe, expect, it } from 'vitest'
import { carriedHandle, carryFields, readCarry } from './carry'

describe('what a visitor brings to the launch', () => {
  it('accepts a handle with single hyphens inside and nothing else', () => {
    expect(carriedHandle('river-studio')).toBe('river-studio')
    expect(carriedHandle('ab')).toBe('ab')
    for (const bad of ['a', '-x', 'x-', 'a--b', 'Upper', 'has space', 'a/b', '', 'x'.repeat(41), 5, null, undefined]) expect(carriedHandle(bad)).toBeNull()
  })

  it('reads the carry back and drops anything off-shape', () => {
    expect(readCarry({ name: 'Saltwater', handle: 'saltwater', theme: 'designer', accent: '3', host: '  Sam   Rivera ' })).toEqual({ handle: 'saltwater', theme: 'designer', accent: '3', host: 'Sam Rivera' })
    expect(readCarry({ handle: '../x', theme: 'bad theme!', accent: 'x', host: '   ' })).toEqual({})
    expect(readCarry(undefined)).toEqual({})
  })

  it('reads the v3 builder keys and drops a phone, place or photo token off-shape', () => {
    const full = { line: ' Weekly  pottery classes. ', phone: '+1 (760) 555-0100', where: 'Carlsbad', cover: 's2', logo: 'mono', profile: 'initials' }
    expect(readCarry(full)).toEqual({ ...full, line: 'Weekly pottery classes.' })
    expect(readCarry({ phone: 'call me', where: '   ', cover: 'https://x', logo: 'drop table', profile: 's', lead: 'short' })).toEqual({})
    expect(readCarry({ line: 'x'.repeat(200) }).line).toHaveLength(160)
    expect(readCarry({ where: 'y'.repeat(100) }).where).toHaveLength(80)
  })

  it('round-trips every key and keeps the Spotlight step inside the thirteen keys the hold allows', () => {
    const carry = { handle: 'saltwater', theme: 'designer', accent: '2', host: 'Sam', line: 'Pottery.', phone: '555 0100', where: 'Online', cover: 'up', logo: 'word', profile: 's1', lead: 'AbCdEfGhIjKlMnOpQrStUvWxYz012345' }
    expect(readCarry(carryFields(carry))).toEqual(carry)
    expect(Object.keys(carryFields(carry)).length + ['name', 'link'].length).toBeLessThanOrEqual(13)
  })

  it('writes only the keys that have a value, and what it writes reads back whole', () => {
    const carry = { handle: 'saltwater', theme: 'designer', accent: '2', host: 'Sam' }
    expect(readCarry(carryFields(carry))).toEqual(carry)
    expect(carryFields({ handle: 'saltwater' })).toEqual({ handle: 'saltwater' })
    expect(carryFields({})).toEqual({})
  })
})
