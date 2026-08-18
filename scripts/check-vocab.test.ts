import { describe, it, expect } from 'vitest'
import { checkVocab, MIN_SCANNED_FILES } from './check-vocab.mjs'

// The vocabulary contract (ADR-879 / ADR-887, enforced per ADR-889), moved out of the CI guards
// array on 2026-08-12 and into vitest. Vitest AUTO-DISCOVERS `*.test.ts`, so this guard cannot be
// forgotten in an array — which is exactly how check:studio came to enforce nothing for the whole
// life of PR #2098. `node scripts/check-vocab.mjs` still prints the report and the allowlist.
//
// checkVocab() resolves every path from the SCRIPT's location, not the cwd, so it reads the real
// repo wherever vitest is invoked from. That is the drift worth catching.

describe('check-vocab · the live tree', () => {
  it('scanned a real corpus, so silence means something (the non-triviality floor)', () => {
    // Rule A's verdict is "none of the N files I read holds a hand copy". N was unchecked until
    // 2026-08-12, and this guard was measured reporting "✓ one source per vocabulary" over an
    // empty corpus. Assert N first: a guard that reports a clean bill of health over nothing turns
    // "I never looked" into "I looked and it was fine".
    const { scanned } = checkVocab()
    expect(scanned).toBeGreaterThanOrEqual(MIN_SCANNED_FILES)
  })

  it('parsed every vocabulary out of its canonical source, and the hub catalog is non-empty', () => {
    // The vocabularies are parsed from the source files rather than hardcoded here, so a changed
    // declaration shape must fail loudly instead of yielding an empty key set nothing can violate.
    const { vocabs, hubValues } = checkVocab()
    expect(vocabs.length).toBeGreaterThanOrEqual(3)
    for (const v of vocabs) expect(v.keys.length, v.name).toBeGreaterThanOrEqual(3)
    expect(hubValues.length).toBeGreaterThan(0)
  })

  it('one source per vocabulary; every picker reads it; the event hub matches it exactly', () => {
    const { violations } = checkVocab()
    expect(violations, `\n${violations.join('\n')}\n`).toEqual([])
  })
})
