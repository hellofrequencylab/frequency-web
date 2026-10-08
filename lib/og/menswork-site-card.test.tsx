import { describe, expect, it } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { MensworkSiteCard } from './menswork-site-card'

// LIVE-870 (owner ask 2026-10-08: "a really well designed social share card with the logo on it").

const card = (headline: string | null) =>
  renderToStaticMarkup(
    <MensworkSiteCard brandName="Heart on Fire" headline={headline} domain="theheartonfire.com" season="fall" logo="data:image/png;base64,AA" cover={null} />,
  )

describe('the Menswork website share card', () => {
  it('carries the logo, the name, the headline with its accent word apart, and the domain', () => {
    const html = card('A year of men’s work, one *circle* at a time.')
    expect(html).toContain('src="data:image/png;base64,AA"')
    expect(html).toContain('Heart on Fire')
    expect(html).toContain('theheartonfire.com')
    expect(html).toContain('>circle</span>')
    expect(html).not.toContain('*')
  })

  it('stands alone: no Frequency mark or name', () => {
    expect(card(null)).not.toMatch(/frequency/i)
  })

  it.each(['public/fonts/SofiaSansExtraCondensed-ExtraBold.ttf', 'public/fonts/Barlow-Medium.ttf'])(
    '%s is a full TrueType face, which Satori can read',
    (path) => {
      expect(statSync(path).size).toBeGreaterThan(50_000)
      expect(readFileSync(path).subarray(0, 4).toString('hex')).toBe('00010000')
    },
  )
})
