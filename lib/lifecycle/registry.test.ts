import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LIFECYCLE_EMAILS, lifecycleRank } from './registry'

describe('lifecycle registry', () => {
  it('has unique, well-formed kinds that match the ledger check', () => {
    const kinds = LIFECYCLE_EMAILS.map((e) => e.kind)
    expect(new Set(kinds).size).toBe(kinds.length)
    for (const k of kinds) expect(k).toMatch(/^[a-z][a-z0-9_]{0,39}$/)
  })
  it('points every entry at a builder file that exists', () => {
    for (const e of LIFECYCLE_EMAILS) expect(existsSync(e.file), `${e.kind}: ${e.file}`).toBe(true)
  })
  it('ranks unknown kinds strictest', () => {
    expect(lifecycleRank('launched_welcome')).toBe(1)
    expect(lifecycleRank('not_registered')).toBe(3)
  })
})
