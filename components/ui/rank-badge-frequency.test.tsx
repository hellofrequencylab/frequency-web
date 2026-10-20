// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { RankBadge } from './rank-badge'

// SCAN-860 (owner ruling 2026-10-20: "One iridescent look"). Under Frequency a reached season rank is the --fq-pa pill
// and Ghost a plain track pill; the spectrum keys that pillars and Space accents share keep their DAWN hues.
describe('Season rank badges in Frequency (SCAN-860)', () => {
  it('stamps data-season-rank on a season rank only', () => {
    expect(renderToStaticMarkup(<RankBadge rank="adept" />)).toContain('data-season-rank="adept"')
    expect(renderToStaticMarkup(<RankBadge rank="ghost" />)).toContain('data-season-rank="ghost"')
    expect(renderToStaticMarkup(<RankBadge rank="jade" />)).not.toContain('data-season-rank')
  })

  it('the alias layer draws reached ranks iridescent and Ghost on the track', () => {
    const css = readFileSync('app/themes/frequency.css', 'utf8')
    expect(css).toMatch(/\[data-design="frequency"\] \.rank-badge\[data-season-rank\] \{\s*background: var\(--fq-pa\);/)
    expect(css).toMatch(/\.rank-badge\[data-season-rank="ghost"\] \{\s*background: var\(--fq-track\);/)
  })
})
