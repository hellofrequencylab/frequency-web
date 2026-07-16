import { describe, it, expect } from 'vitest'
import { parseJsonText } from './json'

describe('parseJsonText', () => {
  it('parses an array of objects, unioning keys in first-seen order', () => {
    const src = parseJsonText(JSON.stringify([
      { name: 'A', email: 'a@x.com' },
      { name: 'B', phone: '555' },
    ]))
    expect(src.headers).toEqual(['name', 'email', 'phone'])
    expect(src.rows).toEqual([
      { name: 'A', email: 'a@x.com', phone: '' },
      { name: 'B', email: '', phone: '555' },
    ])
  })

  it('unwraps a { contacts: [...] } envelope', () => {
    const src = parseJsonText(JSON.stringify({ contacts: [{ name: 'A', email: 'a@x.com' }] }))
    expect(src.rows).toHaveLength(1)
    expect(src.rows[0]).toEqual({ name: 'A', email: 'a@x.com' })
  })

  it('flattens a nested value to one JSON cell (nothing lost)', () => {
    const src = parseJsonText(JSON.stringify([{ name: 'A', address: { city: 'Austin' } }]))
    expect(src.rows[0].address).toContain('Austin')
  })

  it('treats a single bare object as one contact', () => {
    const src = parseJsonText(JSON.stringify({ name: 'Solo', email: 's@x.com' }))
    expect(src.rows).toHaveLength(1)
    expect(src.rows[0].name).toBe('Solo')
  })

  it('returns an empty source (no throw) for invalid JSON', () => {
    expect(parseJsonText('{not json')).toEqual({ headers: [], rows: [], rowCount: 0 })
  })
})
