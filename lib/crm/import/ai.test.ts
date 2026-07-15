import { describe, it, expect } from 'vitest'
import { coerceExtracted } from './ai'

// AI-parse coercion: the model's tool output is untrusted, so coerceExtracted trims, caps,
// lowercases the email, drops empty / identity-less rows, and never throws on junk. The AI
// kernel itself is never invoked here — we only test the coercion boundary.

describe('coerceExtracted', () => {
  it('keeps only rows with a name, email, or phone and normalizes fields', () => {
    const out = coerceExtracted({
      contacts: [
        { name: '  Sarah Lee ', email: 'SARAH@X.COM', phone: '555-1234', company: 'Acme', notes: 'met at expo' },
        { company: 'NoIdentity Co' }, // no name/email/phone -> dropped
        { name: 'Phone Only', phone: '555-9999' },
        { email: 'e@x.com' },
      ],
    })
    expect(out).toHaveLength(3)
    expect(out[0]).toEqual({
      name: 'Sarah Lee',
      email: 'sarah@x.com',
      phone: '555-1234',
      company: 'Acme',
      notes: 'met at expo',
    })
    expect(out[1]).toEqual({ name: 'Phone Only', phone: '555-9999' })
    expect(out[2]).toEqual({ email: 'e@x.com' })
  })

  it('is fail-safe on malformed / non-array input', () => {
    expect(coerceExtracted(null)).toEqual([])
    expect(coerceExtracted({})).toEqual([])
    expect(coerceExtracted({ contacts: 'nope' })).toEqual([])
    expect(coerceExtracted({ contacts: [null, 42, 'x', {}] })).toEqual([])
  })

  it('ignores non-string field values without throwing', () => {
    const out = coerceExtracted({ contacts: [{ name: 123, email: {}, phone: '555', notes: [] }] })
    expect(out).toEqual([{ phone: '555' }])
  })
})
