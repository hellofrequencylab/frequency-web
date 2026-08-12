import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { SITE_NAME, SITE_TAGLINE } from '@/lib/site'

// ── THE ONE STALENESS A COMMITTED SHARE CARD CAN HIDE (ADR-1002) ────────────────────────────
//
// The root share card is a FILE now, not a route: `app/opengraph-image.jpg`. That is what took
// `next/og` — and the 17.7MB of libvips it loads through sharp — out of 384 serverless functions.
// The cost of the trade is that the card no longer re-renders when its inputs change, and a stale
// share card is invisible from inside the app: every page still renders, every test still passes,
// and the only symptom is a wrong image on someone else's website.
//
// The image bytes cannot be checked here without re-rasterising. What CAN be checked is that the
// words on it still match the words the app calls itself, since a rename is the realistic way this
// goes stale. If this fails, regenerate the card — the recipe is at the top of
// app/dev/og-root-card/route.tsx — and update the .alt.txt files in the same pass.

const ROOT = process.cwd()
const CARDS = ['opengraph-image', 'twitter-image'] as const

describe('root share card', () => {
  it('ships as a static file, not a route that every page inherits', () => {
    for (const name of CARDS) {
      const jpg = join(ROOT, 'app', `${name}.jpg`)
      expect(existsSync(jpg), `${name}.jpg is missing`).toBe(true)
      // A truncated or placeholder file would still "exist". The real card is ~84KB.
      expect(statSync(jpg).size).toBeGreaterThan(20_000)
      // The .tsx form is what made this module inherited by every page in the app.
      expect(existsSync(join(ROOT, 'app', `${name}.tsx`)), `${name}.tsx is back`).toBe(false)
    }
  })

  it('declares alt text that still matches what the site calls itself', () => {
    for (const name of CARDS) {
      const alt = readFileSync(join(ROOT, 'app', `${name}.alt.txt`), 'utf8')
      expect(alt).toContain(SITE_NAME)
      expect(alt).toContain(SITE_TAGLINE)
    }
  })

  it('keeps the generator in the repo so the card can be remade', () => {
    const gen = join(ROOT, 'app', 'dev', 'og-root-card', 'route.tsx')
    expect(existsSync(gen)).toBe(true)
    // It must stay OUT of the metadata-image filenames, or the inheritance comes straight back.
    expect(readFileSync(gen, 'utf8')).toContain('export async function GET')
  })
})
