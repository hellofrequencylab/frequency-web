import { describe, it, expect } from 'vitest'
import { VERA_TOOLS, getTool, requiresConfirmation, validateToolCall } from './tools'

describe('Vera tool surface', () => {
  it('has unique, slug keys', () => {
    const keys = VERA_TOOLS.map((t) => t.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of keys) expect(k).toMatch(/^[a-z][a-z0-9_]*$/)
  })

  it('every write tool carries a member-facing confirm label', () => {
    for (const t of VERA_TOOLS) {
      if (t.mode === 'write') expect(t.confirmLabel, `${t.key} needs a confirmLabel`).toBeTruthy()
    }
  })

  it('classifies confirmation by mode', () => {
    expect(requiresConfirmation('remember_fact')).toBe(true) // write
    expect(requiresConfirmation('set_profile_field')).toBe(true)
    expect(requiresConfirmation('suggest_circle')).toBe(false) // read
    expect(requiresConfirmation('nope')).toBe(false)
  })

  it('getTool resolves known tools only', () => {
    expect(getTool('find_host')?.mode).toBe('read')
    expect(getTool('nope')).toBeUndefined()
  })
})

describe('validateToolCall', () => {
  it('accepts a well-formed call', () => {
    expect(validateToolCall('remember_fact', { fact: 'loves trail running', category: 'interests' })).toEqual({ ok: true, errors: [] })
  })

  it('rejects an unknown tool', () => {
    expect(validateToolCall('delete_everything', {}).ok).toBe(false)
  })

  it('flags missing required params', () => {
    const r = validateToolCall('set_profile_field', { field: 'bio' }) // missing value
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('value')
  })

  it('flags wrong types and unknown params', () => {
    expect(validateToolCall('find_host', { topic: 123 }).ok).toBe(false)
    expect(validateToolCall('suggest_circle', { bogus: 'x' }).ok).toBe(false)
  })
})
