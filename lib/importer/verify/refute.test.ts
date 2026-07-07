import { describe, it, expect } from 'vitest'

// The adversarial refuter's coercion is the fail-CLOSED boundary: any garbage from the model,
// or a supported/contradicted verdict WITHOUT a quoted snippet, collapses to 'unsupported' (the
// safe default). Pinned without a network.

import { coerceVerdict, buildRefutePrompt } from './refute'
import type { HarvestedSource } from '../intake'

describe('coerceVerdict — fail closed to unsupported', () => {
  it('keeps a supported verdict that quotes a snippet', () => {
    const out = coerceVerdict({ verdict: 'supported', snippet: '123 Main St', confidence: 0.9 })
    expect(out.verdict).toBe('supported')
    expect(out.snippet).toBe('123 Main St')
    expect(out.confidence).toBe(0.9)
  })

  it('downgrades a supported verdict with NO snippet to unsupported', () => {
    const out = coerceVerdict({ verdict: 'supported', confidence: 0.9 })
    expect(out.verdict).toBe('unsupported')
  })

  it('downgrades a contradicted verdict with NO snippet to unsupported', () => {
    expect(coerceVerdict({ verdict: 'contradicted' }).verdict).toBe('unsupported')
  })

  it('keeps a contradicted verdict that quotes a snippet', () => {
    expect(coerceVerdict({ verdict: 'contradicted', snippet: '9 Oak Ave' }).verdict).toBe('contradicted')
  })

  it('treats a garbage / missing verdict as unsupported', () => {
    expect(coerceVerdict(null).verdict).toBe('unsupported')
    expect(coerceVerdict({}).verdict).toBe('unsupported')
    expect(coerceVerdict({ verdict: 'maybe' }).verdict).toBe('unsupported')
  })

  it('clamps confidence into 0..1 and drops garbage', () => {
    expect(coerceVerdict({ verdict: 'unsupported', confidence: 5 }).confidence).toBe(1)
    expect(coerceVerdict({ verdict: 'unsupported', confidence: -1 }).confidence).toBe(0)
    expect(coerceVerdict({ verdict: 'unsupported', confidence: 'x' }).confidence).toBeUndefined()
  })
})

describe('buildRefutePrompt — hands the refuter only snippets, never the draft', () => {
  const sources: HarvestedSource[] = [
    { id: 's1', kind: 'page', url: 'https://acme.test', fetchedAt: 'now', text: 'We are at 123 Main St.' },
    { id: 's2', kind: 'page', url: 'https://acme.test/x', fetchedAt: 'now', text: '' }, // empty, dropped
  ]

  it('includes the claim, the field path, and the non-empty snippets', () => {
    const p = buildRefutePrompt('123 Main St', 'contact.address', sources)
    expect(p).toContain('CLAIM: 123 Main St')
    expect(p).toContain('contact.address')
    expect(p).toContain('123 Main St.')
    expect(p).toContain('https://acme.test')
  })

  it('is honest when nothing was harvested', () => {
    const p = buildRefutePrompt('123 Main St', 'contact.address', [])
    expect(p).toContain('(no snippets were harvested)')
  })
})
