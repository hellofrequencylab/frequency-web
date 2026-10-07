import { describe, it, expect } from 'vitest'
import {
  SEED_FIDELITIES,
  defaultSeedFidelity,
  fidelityDirective,
  fidelitySourceCap,
  keepsAuthorWords,
  normalizeSeedFidelity,
} from './fidelity'

// The Exact / Edit / Rewrite choice (owner request 2026-10-07). Rewrite is the old behaviour and
// must stay byte for byte; Exact and Edit must keep the author's text whole.

describe('the fidelity choice', () => {
  it('offers exactly Exact, Edit, Rewrite in that order', () => {
    expect(SEED_FIDELITIES.map((f) => f.label)).toEqual(['Exact', 'Edit', 'Rewrite'])
  })

  it('normalizes anything unknown to Rewrite, so an old caller behaves as before', () => {
    expect(normalizeSeedFidelity(undefined)).toBe('rewrite')
    expect(normalizeSeedFidelity('verbatim')).toBe('rewrite')
    expect(normalizeSeedFidelity('exact')).toBe('exact')
    expect(keepsAuthorWords('edit')).toBe(true)
    expect(keepsAuthorWords(null)).toBe(false)
  })

  it('defaults to Edit when the author brought text, Rewrite when they only answered questions', () => {
    expect(defaultSeedFidelity(true)).toBe('edit')
    expect(defaultSeedFidelity(false)).toBe('rewrite')
  })

  it('reads the whole upload when keeping words, and the old cap on Rewrite', () => {
    expect(fidelitySourceCap('rewrite', 4000)).toBe(4000)
    expect(fidelitySourceCap('exact', 4000)).toBe(20_000)
    expect(fidelitySourceCap('edit', 8000)).toBe(20_000)
  })

  it('adds no directive on Rewrite, and a no-drop directive on Exact and Edit', () => {
    expect(fidelityDirective('rewrite', 'description')).toBe('')
    for (const f of ['exact', 'edit'] as const) {
      const d = fidelityDirective(f, 'description')
      expect(d).toContain('"description"')
      expect(d).toContain('Do not summarize')
      expect(d).not.toMatch(/[–—]/)
    }
    expect(fidelityDirective('exact')).toContain('verbatim')
  })
})
