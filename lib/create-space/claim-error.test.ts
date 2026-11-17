import { describe, expect, it } from 'vitest'
import { claimErrorHref, claimErrorLine } from './claim-error'

// LIVE-2331: a refused Google claim carries a closed code back to the builder, which shows a plain line for it.
describe('claim error codes', () => {
  it('sends each code back to the builder with the reason', () => {
    expect(claimErrorHref('handle')).toBe('/create-a-space?claim_error=handle#get-started')
    expect(claimErrorHref('draft')).toBe('/create-a-space?claim_error=draft#get-started')
  })

  it('turns each code into its own line, and anything else into the generic one', () => {
    expect(claimErrorLine('handle')).toMatch(/handle got taken/)
    expect(claimErrorLine('draft')).toMatch(/draft/)
    const generic = claimErrorLine('generic')
    expect(generic).toMatch(/Google sign-in did not start/)
    for (const odd of ['<script>', 'toString', '__proto__', 'HANDLE']) expect(claimErrorLine(odd)).toBe(generic)
  })

  it('says nothing when there is no code', () => {
    expect(claimErrorLine(null)).toBeNull()
    expect(claimErrorLine('')).toBeNull()
  })

  it('never uses an em dash in the copy', () => {
    for (const code of ['handle', 'draft', 'generic']) expect(claimErrorLine(code)).not.toContain('—')
  })
})
