import { describe, it, expect } from 'vitest'
import { SPOTLIGHT_SELECT, SPOTLIGHT_COLUMNS, SPOTLIGHT_FORBIDDEN } from './privacy'

describe('spotlight privacy allowlist', () => {
  const select = SPOTLIGHT_SELECT.toLowerCase()

  it('never includes a contact / geo / auth / billing / meta column', () => {
    for (const forbidden of SPOTLIGHT_FORBIDDEN) {
      expect(select).not.toContain(forbidden)
    }
  })

  it('reads region by LABEL only, never coordinates', () => {
    expect(select).toContain('nexus_regions')
    expect(select).not.toContain('lat')
    expect(select).not.toContain('lng')
    expect(select).not.toContain('coord')
  })

  it('is an explicit allowlist, not a wildcard', () => {
    expect(SPOTLIGHT_SELECT).not.toContain('*')
    expect(SPOTLIGHT_COLUMNS.length).toBeGreaterThan(5)
  })
})
