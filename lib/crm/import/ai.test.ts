import { describe, it, expect, vi } from 'vitest'

// No model is ever called: the one seam to the provider is mocked, and each test hands it the tool_use block a
// model would have returned.
const mocks = vi.hoisted(() => ({ complete: vi.fn() }))
vi.mock('@/lib/ai/complete', () => ({ completeRaw: mocks.complete }))
import { coerceExtracted, proposeMapping } from './ai'

/** Read one propose_import_mapping reply through the real call path. */
async function coerceSuggestions(raw: unknown) {
  mocks.complete.mockResolvedValueOnce({ content: [{ type: 'tool_use', id: 't', name: 'propose_import_mapping', input: raw }] })
  return proposeMapping({ headers: ['A'], sampleRows: [] })
}

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

// The mapping reply goes through one schema (PROG-E8B). A valid reply reads exactly as the hand-written reader read
// it; anything off the closed target enum, or not the declared shape, never becomes a suggestion.
describe('coerceSuggestions', () => {
  it('keeps on-enum rows, trims, clamps confidence and carries a short note', async () => {
    const out = await coerceSuggestions({
      columns: [
        { header: '  Full Name ', target: ' displayName ', confidence: 0.9, note: '  split it  ' },
        { header: 'Lead source', target: 'custom', confidence: '0.4' },
        { header: 'Row id', target: 'ignore', confidence: 7 },
        { header: 'Mail', target: 'email' },
        { header: 'Odd', target: 'email', confidence: 'high', note: 12 },
      ],
    })
    expect(out).toEqual([
      { header: 'Full Name', target: 'displayName', confidence: 0.9, note: 'split it' },
      { header: 'Lead source', target: 'custom', confidence: 0.4 },
      { header: 'Row id', target: 'ignore', confidence: 1 },
      { header: 'Mail', target: 'email', confidence: 0.5 },
      { header: 'Odd', target: 'email', confidence: 0.5 },
    ])
  })

  it('never invents a field: an off-enum target, a blank header or a non-object row is dropped', async () => {
    const out = await coerceSuggestions({
      columns: [
        { header: 'Salary', target: 'salary', confidence: 1 },
        { header: '   ', target: 'email', confidence: 1 },
        { header: 7, target: 'email', confidence: 1 },
        { target: 'email' },
        null,
        'email',
        { header: 'Kept', target: 'phone', confidence: 1 },
      ],
    })
    expect(out).toEqual([{ header: 'Kept', target: 'phone', confidence: 1 }])
  })

  it('is fail-safe on a reply that is not the declared shape', async () => {
    for (const raw of [null, undefined, 'columns', 42, [], {}, { columns: 'nope' }, { columns: { header: 'a', target: 'email' } }]) {
      expect(await coerceSuggestions(raw)).toEqual([])
    }
  })

  it('caps a long note', async () => {
    const [only] = await coerceSuggestions({ columns: [{ header: 'A', target: 'notes', confidence: 1, note: 'n'.repeat(400) }] })
    expect(only!.note).toHaveLength(160)
  })
})
