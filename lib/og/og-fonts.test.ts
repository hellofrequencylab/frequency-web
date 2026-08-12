import { describe, it, expect } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import { loadNunito } from './load-nunito'

// ── OG share-card fonts: bundled, TrueType, and never fetched ─────────────────────────────
//
// 🔴 THE BUG THIS GUARDS. `load-nunito.ts` used to fetch a Nunito subset from
// `fonts.googleapis.com` on every render — a CSS request plus a TTF request, per weight, twice.
// Measured against the live endpoint: **1,628ms for the CSS alone, ~3.4s for both weights**, on
// top of the cover fetch, the logo fetch and PNG rasterisation.
//
// Apple Mail's link preview timed out and fell back to title + domain + favicon, while iMessage
// (which waits longer) rendered the full card. Same page, same correct og:image tag, two
// different results — reported three times as "no preview appeared in Apple Mail".
//
// Every assertion here is for a SILENT failure. A wrong font format does not throw at build time;
// it throws inside Satori at request time, on a route nobody opens in development, and the
// symptom is a missing preview in someone else's mail client.

const FACES = ['public/fonts/Nunito-Bold.ttf', 'public/fonts/Nunito-Black.ttf']

describe('the faces are bundled and are really TrueType', () => {
  it.each(FACES)('%s exists and is a plausible font', (path) => {
    const size = statSync(path).size
    // A subset is ~2KB and a full face ~125KB. Anything tiny means someone re-subset it and
    // reintroduced the tofu bug for names outside the subset.
    expect(size).toBeGreaterThan(50_000)
  })

  it.each(FACES)('%s has the TrueType magic number, not woff', (path) => {
    // 🔴 THE TRAP. Google Fonts serves `woff` to a modern browser User-Agent and `truetype` only
    // when the request sends NO User-Agent. Satori cannot parse woff. The first download here
    // used the old code's browser UA, got woff, and would have broken every share card — the
    // catch in load-nunito only covers a missing FILE, never an unparseable one.
    const magic = readFileSync(path).subarray(0, 4)
    expect(magic.toString('hex')).toBe('00010000')
    expect(magic.toString('latin1')).not.toBe('wOFF')
    expect(magic.toString('latin1')).not.toBe('wOF2')
  })
})

describe('loading them touches no network', () => {
  const src = readFileSync('lib/og/load-nunito.ts', 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('does not fetch at all', () => {
    expect(code).not.toContain('fetch(')
    expect(code).not.toContain('googleapis')
  })

  it('reads from disk and memoises per process', () => {
    expect(code).toContain('readFile')
    // A warm lambda must read each face once, not once per card.
    expect(code).toContain('cache.set')
  })

  it('caches only RESOLVED bytes, never a rejected promise', () => {
    // 🔴 The first version cached the promise eagerly, so ONE transient filesystem failure made
    // that lambda serve broken share cards for the rest of its life with no recovery path.
    expect(code).toContain('const cache = new Map<number, ArrayBuffer>()')
    expect(code).not.toContain('const cache = new Map<number, Promise<ArrayBuffer>>()')
    // And concurrent cards must share one read rather than each starting their own.
    expect(code).toContain('inflight')
  })

  it('the fallback preserves the weight it claims to serve', () => {
    // The earlier fallback demoted 700 to LiberationSans-Regular while the caller still declared
    // weight 700 to Satori, so a fallback render was silently the wrong weight.
    // Quote-agnostic: prettier owns the quote style in that file and a literal match would break
    // on a reformat rather than on a real regression.
    expect(code).toMatch(/["']LiberationSans-Bold\.ttf["']/)
    expect(code).toMatch(/\.catch\(\s*\(\)\s*=>\s*readLiberationBold\(\)\s*\)/)
    expect(code).not.toContain('LiberationSans-Regular.ttf')
  })

  it('builds every font path from LITERALS, never from a parameter', () => {
    // 🔴 THE ~300MB BUG. The three reads used to share one `read(file)` helper. @vercel/nft cannot
    // resolve a path assembled from a variable, so it globbed the deepest prefix it could resolve —
    // the whole `public/fonts` directory — into all 69 functions reaching this module, shipping
    // LiberationSans-Regular (410,820 bytes) and the licence text to each. Same failure as ADR-1004's
    // `join(process.cwd(), ...rubricPath)`, which swept the repo root into ~300 functions.
    //
    // Nothing about the glob is visible at runtime: the cards render fine, the deploy just grows.
    // This assertion is the only thing that notices, so it checks the SHAPE, not the outcome.
    const args = [...code.matchAll(/public\/fonts["'],\s*([^)]+)\)/g)].map((m) =>
      m[1].trim(),
    )
    expect(args.length).toBeGreaterThanOrEqual(3) // Nunito Bold + Black, and the Liberation fallback
    for (const arg of args) expect(arg).toMatch(/^["'][A-Za-z-]+\.ttf["']$/)
  })

  it('returns real bytes for both weights, fast', async () => {
    const t0 = Date.now()
    const [bold, black] = await Promise.all([loadNunito(700), loadNunito(900)])
    const ms = Date.now() - t0
    expect(bold.byteLength).toBeGreaterThan(50_000)
    expect(black.byteLength).toBeGreaterThan(50_000)
    // The two weights must be DIFFERENT faces — an early version keyed the cache wrong and
    // handed the same buffer back for both, which renders every card in one weight.
    expect(bold.byteLength).not.toBe(black.byteLength)
    // Generous, but a network fetch cannot pass this. The old path took ~3,400ms.
    expect(ms).toBeLessThan(500)
  })

  it('the second call is served from the cache', async () => {
    await loadNunito(900)
    const t0 = Date.now()
    await loadNunito(900)
    expect(Date.now() - t0).toBeLessThan(20)
  })
})

describe('the faces reach the serverless runtime', () => {
  const cfg = readFileSync('next.config.ts', 'utf8')
  const block = cfg.match(/outputFileTracingIncludes:\s*\{([\s\S]*?)\n {2}\}/)?.[1] ?? ''
  // The route keys that carry the faces as belt-and-braces. Substring matches (picomatch runs these
  // in `contains` mode), so they cover the hash-suffixed metadata routes too.
  const CARD_KEYS = ["'/opengraph-image'", "'/twitter-image'", "'/dev/og-root-card'"]

  it('every face load-nunito can open is named for the card routes', () => {
    // Belt-and-braces, not the delivery mechanism: the literal-path assertion above is what actually
    // gets the faces into the bundle. These keys exist because the failure is invisible — Satori
    // throws on an empty `fonts` array and `deliverCard` swallows it, so a missing face reads as a
    // broken preview in someone else's mail client (DEPLOY-SAFETY rule 6).
    //
    // Derived from the loader rather than hardcoded, so adding a weight there without shipping it
    // here fails HERE instead of at request time on a route nobody opens in development.
    const loader = readFileSync('lib/og/load-nunito.ts', 'utf8')
    const faces = [...loader.matchAll(/["']([A-Za-z-]+\.ttf)["']/g)].map((m) => m[1])
    expect(faces.length).toBeGreaterThanOrEqual(3) // Nunito Bold + Black, and the Liberation fallback
    for (const face of new Set(faces)) expect(cfg).toContain(`'./public/fonts/${face}'`)
    for (const key of CARD_KEYS) expect(block).toContain(`${key}: OG_CARD_FONTS`)
  })

  it('and they are OFF the catch-all key, which is what cost 284MB', () => {
    // 🔴 The faces used to sit on '/**': 650KB × 482 functions, for the 10 routes that rasterise.
    // They ship on their own now because load-nunito's reads are literal-pathed. Putting them back
    // on the catch-all would be silent — nothing renders differently, the deploy just grows by a
    // quarter of a gigabyte, which is the shape of failure ADR-1003's budget gate exists to catch.
    const catchAll = block.match(/'\/\*\*':\s*\[([\s\S]*?)\]/)?.[1] ?? ''
    expect(catchAll).not.toContain('public/fonts')
  })

  it('and does NOT sweep in the faces nothing reads', () => {
    // 🔴 The first version used './public/fonts/*.ttf', which also shipped LiberationSans-Regular
    // (410,820 bytes) into EVERY lambda in the app. Nothing opens it from disk — flyer-raster.ts
    // fetches its faces over HTTP — so it was pure weight on every cold start.
    expect(cfg).not.toContain("'./public/fonts/*.ttf'")
    expect(cfg).not.toContain("'./public/fonts/LiberationSans-Regular.ttf'")
  })

  it('and it did not displace the help content on the same key', () => {
    // 🔴 A second '/**' key is a TS error AND the later one silently wins. Adding one here would
    // have dropped './content/help/**/*' and left "Ask Vera" deflecting every question — the exact
    // failure that key's own comment warns about. Caught by tsc while writing this; pinned so the
    // next person folds into the key instead of adding another.
    expect(cfg).toContain("'./content/help/**/*'")
    const block = cfg.match(/outputFileTracingIncludes:\s*\{([\s\S]*?)\n {2}\}/)?.[1] ?? ''
    const keys = [...block.matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1])
    expect(keys.length).toBe(new Set(keys).size)
    // The '/**' key must still carry the help content, not just exist somewhere in the file.
    expect(block).toMatch(/'\/\*\*': \[[\s\S]*?'\.\/content\/help\/\*\*\/\*'/)
  })
})
