import { describe, expect, it } from 'vitest'
import { isHandleShape, parseVerdict, suggestHandle, verdictFor } from '@/lib/create-space/handle'
import { isValidHandle } from '@/lib/create-space/builder'

describe('the shape of a handle', () => {
  it('is the builder rule and the Space route rule together', () => {
    for (const ok of ['saltwater', 'river-studio', 'ab', 'a1', 'x'.repeat(40)]) expect(isHandleShape(ok)).toBe(true)
    for (const bad of ['', 'a', '-x', 'x-', 'a--b', 'Upper', 'has space', 'a/b', 'x'.repeat(41), 'café', 5, null, undefined]) expect(isHandleShape(bad)).toBe(false)
  })
})

describe('the verdict', () => {
  it('is invalid before anyone asks the table', () => {
    expect(verdictFor('-x', false)).toBe('invalid')
    expect(verdictFor('-x', null)).toBe('invalid')
    expect(verdictFor(undefined, true)).toBe('invalid')
  })
  it('is taken or free from what the table said', () => {
    expect(verdictFor('saltwater', true)).toBe('taken')
    expect(verdictFor('saltwater', false)).toBe('free')
  })
  it('never says free when the read failed', () => {
    expect(verdictFor('saltwater', null)).toBeNull()
  })
})

describe('reading the answer back', () => {
  it('keeps the three words and nothing else', () => {
    expect(parseVerdict({ status: 'free' })).toBe('free')
    expect(parseVerdict({ status: 'taken' })).toBe('taken')
    expect(parseVerdict({ status: 'invalid' })).toBe('invalid')
    for (const odd of [null, undefined, {}, [], 'free', { status: 'maybe' }, { status: 1 }, { error: 'rate_limited' }]) expect(parseVerdict(odd)).toBeNull()
  })
})

describe('the suggestion', () => {
  it('adds hq and stays a handle', () => {
    expect(suggestHandle('saltwater')).toBe('saltwaterhq')
    expect(isValidHandle(suggestHandle('x'.repeat(40)))).toBe(true)
    expect(suggestHandle('river-')).toBe('riverhq')
    expect(isValidHandle(suggestHandle('river-studio'))).toBe(true)
  })
})
