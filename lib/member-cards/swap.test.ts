import { describe, expect, it, vi } from 'vitest'

// LIVE-1282: the Swap contacts form's validation and note text. Pure; the IO modules are stubbed so the
// test never reaches Supabase.
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/connections/store', () => ({ addNote: vi.fn(), touchLastContacted: vi.fn() }))
vi.mock('@/lib/crm/lead-capture', () => ({ captureLead: vi.fn(), normalizeEmail: (v: string | null) => v }))
vi.mock('./store', () => ({ logCardTap: vi.fn() }))
vi.mock('./rewards', () => ({ payCardSwap: vi.fn() }))

const { validateSwapInput, swapNoteText, SWAP_LIMITS } = await import('./swap')

describe('validateSwapInput', () => {
  it('takes a name and an email, trimmed and lowercased', () => {
    expect(validateSwapInput({ name: '  Maya   Ortiz ', email: ' Maya@Example.com ' })).toEqual({
      ok: true,
      value: { name: 'Maya Ortiz', email: 'maya@example.com', phone: null, note: null },
    })
  })

  it('takes a phone instead of an email on a member card', () => {
    const r = validateSwapInput({ name: 'Leo', phone: '+1 (760) 555-0142', note: ' Met at the market ' })
    expect(r).toEqual({ ok: true, value: { name: 'Leo', email: null, phone: '+1 (760) 555-0142', note: 'Met at the market' } })
  })

  it('needs a name and a way back', () => {
    expect(validateSwapInput({ email: 'a@b.co' })).toEqual({ ok: false, error: 'Add your name.' })
    expect(validateSwapInput({ name: 'Leo' })).toEqual({ ok: false, error: 'Add an email or a phone number.' })
    expect(validateSwapInput(null)).toEqual({ ok: false, error: 'Add your name.' })
  })

  it('refuses a bad email or phone', () => {
    expect(validateSwapInput({ name: 'Leo', email: 'not-an-email' })).toMatchObject({ ok: false })
    expect(validateSwapInput({ name: 'Leo', phone: '12' })).toMatchObject({ ok: false })
    expect(validateSwapInput({ name: 'Leo', phone: 'call me maybe 5550142' })).toMatchObject({ ok: false })
  })

  it('needs an email on a Space card, because a sealed lead is keyed by email', () => {
    expect(validateSwapInput({ name: 'Leo', phone: '760 555 0142' }, { forSpace: true })).toEqual({
      ok: false,
      error: 'Add your email so they can reach you.',
    })
    expect(validateSwapInput({ name: 'Leo', email: 'leo@example.com' }, { forSpace: true })).toMatchObject({ ok: true })
  })

  it('caps the name and the note', () => {
    expect(validateSwapInput({ name: 'x'.repeat(SWAP_LIMITS.nameMax + 1), email: 'a@b.co' })).toMatchObject({ ok: false })
    expect(validateSwapInput({ name: 'Leo', email: 'a@b.co', note: 'x'.repeat(SWAP_LIMITS.noteMax + 1) })).toMatchObject({ ok: false })
  })

  it('ignores values that are not strings', () => {
    expect(validateSwapInput({ name: 42, email: ['a@b.co'] })).toEqual({ ok: false, error: 'Add your name.' })
  })
})

describe('swapNoteText', () => {
  it('says how they met, with the note when there is one, and no dashes', () => {
    expect(swapNoteText(null)).toBe('Swapped contacts by tapping your Frequency card.')
    const withNote = swapNoteText('Coffee next week?')
    expect(withNote).toBe('Swapped contacts by tapping your Frequency card. They said: Coffee next week?')
    expect(withNote).not.toMatch(/[–—]/)
  })
})
