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

  it('writes only the keys that have a value, and what it writes reads back whole', () => {
    const carry = { handle: 'saltwater', theme: 'designer', accent: '2', host: 'Sam' }
    expect(readCarry(carryFields(carry))).toEqual(carry)
    expect(carryFields({ handle: 'saltwater' })).toEqual({ handle: 'saltwater' })
    expect(carryFields({})).toEqual({})
  })
})
