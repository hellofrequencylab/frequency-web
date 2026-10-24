import { describe, it, expect } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import { loadStageFonts } from './load-stage-fonts'

// The Stage faces fail SILENTLY: Satori throws at request time on a face it cannot parse, on a route
// nobody opens in development, and the symptom is a missing preview in someone else's mail client.
// The active loader also keeps the full Nunito glyph fallback.

const FACES = [
  'public/fonts/Nunito-Bold.ttf',
  'public/fonts/stage/Unbounded-Bold.ttf',
  'public/fonts/stage/HankenGrotesk-Medium.ttf',
  'public/fonts/stage/HankenGrotesk-Bold.ttf',
  'public/fonts/stage/InstrumentSerif-Italic.ttf',
]

describe('the Stage faces are bundled and are really TrueType', () => {
  it.each(FACES)('%s exists and is a plausible font', (path) => {
    expect(statSync(path).size).toBeGreaterThan(20_000)
  })

  it.each(FACES)('%s has the TrueType magic number, not woff2', (path) => {
    expect(readFileSync(path).subarray(0, 4).toString('hex')).toBe('00010000')
  })
})

describe('the loader', () => {
  const src = readFileSync('lib/og/load-stage-fonts.ts', 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('never fetches', () => {
    expect(code).not.toContain('fetch(')
    expect(code).not.toContain('googleapis')
  })

  it('builds every path from a literal, never a parameter (the ~300MB nft glob)', () => {
    const args = [...code.matchAll(/public\/fonts\/stage['"],\s*([^)]+)\)/g)].map((m) => m[1].trim())
    expect(args.length).toBe(4)
    // And the Nunito glyph fallback is its own literal read, not an import of load-nunito.ts.
    expect(code).not.toContain('load-nunito')
    expect(code).toMatch(/public\/fonts['"],\s*['"]Nunito-Bold\.ttf['"]/)
    for (const arg of args) expect(arg).toMatch(/^['"][A-Za-z-]+\.ttf['"]$/)
  })

  it('every face it opens is named for the card routes in next.config.ts', () => {
    const cfg = readFileSync('next.config.ts', 'utf8')
    for (const path of FACES) expect(cfg).toContain(`'./${path}'`)
  })

  it('returns the three families the design system names, plus the glyph fallback', async () => {
    const fonts = await loadStageFonts()
    expect(new Set(fonts.map((f) => f.name))).toEqual(
      new Set(['Unbounded', 'Hanken Grotesk', 'Instrument Serif', 'Nunito']),
    )
    expect(fonts.find((f) => f.name === 'Instrument Serif')?.style).toBe('italic')
    for (const f of fonts) expect(f.data.byteLength).toBeGreaterThan(20_000)
  })
})
