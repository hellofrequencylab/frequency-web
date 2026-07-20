import { describe, it, expect } from 'vitest'
import { searchSiteIcons } from './site-icons'

// The site-icon search backs the Loom picker's Icons view: it turns installed @iconify-json glyphs into
// self-contained SVG data URLs, so a picked icon stores exactly like a picked image.

describe('searchSiteIcons', () => {
  it('returns the house palette (as SVG data URLs) when no query is given', async () => {
    const icons = await searchSiteIcons('')
    expect(icons.length).toBeGreaterThan(0)
    for (const i of icons) {
      expect(i.dataUrl.startsWith('data:image/svg+xml')).toBe(true)
      expect(i.name).toContain(':') // prefix:name
    }
  })

  it('matches glyph names by substring on a query', async () => {
    const icons = await searchSiteIcons('zap', 20)
    expect(icons.length).toBeGreaterThan(0)
    expect(icons.every((i) => i.name.includes('zap'))).toBe(true)
  })

  it('honors the limit', async () => {
    const icons = await searchSiteIcons('a', 5)
    expect(icons.length).toBeLessThanOrEqual(5)
  })

  it('is fail-safe: a no-match query returns an empty list, never throws', async () => {
    const icons = await searchSiteIcons('zzzznotarealiconname')
    expect(icons).toEqual([])
  })
})
