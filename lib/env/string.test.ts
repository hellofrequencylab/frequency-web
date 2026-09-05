import { describe, it, expect, afterEach } from 'vitest'
import { envString, envStringOrNull, envNumber } from './string'

// The property under test (scan2 L3-02): a BLANK variable is unset. `??` does not give you that,
// and `.env.example` ships several keys blank, so every helper here is exercised with '' and
// whitespace as well as with the variable deleted.

const KEY = 'SCAN2_L3_02_PROBE'

function set(value: string | undefined) {
  if (value === undefined) delete process.env[KEY]
  else process.env[KEY] = value
}

afterEach(() => set(undefined))

describe('envStringOrNull', () => {
  it('is null for unset, empty, and whitespace-only', () => {
    set(undefined)
    expect(envStringOrNull(KEY)).toBeNull()
    set('')
    expect(envStringOrNull(KEY)).toBeNull()
    set('   \t ')
    expect(envStringOrNull(KEY)).toBeNull()
  })

  it('returns a set value trimmed', () => {
    set('  people@people.example  ')
    expect(envStringOrNull(KEY)).toBe('people@people.example')
  })
})

describe('envString', () => {
  it('falls back for unset AND for blank (the `??` gap)', () => {
    set(undefined)
    expect(envString(KEY, 'fallback')).toBe('fallback')
    set('')
    expect(envString(KEY, 'fallback')).toBe('fallback')
    // The control: the bare `??` idiom keeps the blank. This is the bug the helper exists for.
    expect(process.env[KEY] ?? 'fallback').toBe('')
  })

  it('prefers a real value', () => {
    set('send.example.test')
    expect(envString(KEY, 'fallback')).toBe('send.example.test')
  })
})

describe('envNumber', () => {
  it('keeps the default for unset, blank, and non-numeric', () => {
    set(undefined)
    expect(envNumber(KEY, 1100)).toBe(1100)
    set('')
    expect(envNumber(KEY, 1100)).toBe(1100)
    set('fast')
    expect(envNumber(KEY, 1100)).toBe(1100)
    set('Infinity')
    expect(envNumber(KEY, 1100)).toBe(1100)
  })

  it('treats an explicit 0 as a deliberate 0, not as blank', () => {
    set('0')
    expect(envNumber(KEY, 1100, { min: 0 })).toBe(0)
    // The control: Number('') is also 0, which is how a blank once passed a `>= 0` guard.
    expect(Number('')).toBe(0)
    set('')
    expect(envNumber(KEY, 1100, { min: 0 })).toBe(1100)
  })

  it('rejects a value below min', () => {
    set('-5')
    expect(envNumber(KEY, 1100, { min: 0 })).toBe(1100)
    set('250')
    expect(envNumber(KEY, 1100, { min: 0 })).toBe(250)
  })
})
