// Flyer → PNG (ADR-126). resvg-wasm ships with no fonts, so flyer text only
// rasterizes if we hand it font buffers. We bundle Liberation Sans (Arial-metric, the
// flyer's target; public/fonts/) and load it once, memoized. Best-effort: if the font
// load fails we still return a PNG (text may be missing) rather than 500 — the vector
// SVG is always the reliable export. Server-only.

import { rasterizeSvg } from '@/lib/qr/raster'
import { SITE_URL } from '@/lib/site'

const FONT_FILES = ['/fonts/LiberationSans-Regular.ttf', '/fonts/LiberationSans-Bold.ttf']

let fontsPromise: Promise<Uint8Array[]> | null = null

// Load the bundled fonts from the public/ assets once. Fetching the static files
// (rather than fs) keeps this working in serverless, where public/ isn't on the
// function filesystem (mirrors the logo fetch in lib/qr/raster.ts).
async function loadFonts(): Promise<Uint8Array[]> {
  if (!fontsPromise) {
    fontsPromise = (async () => {
      const buffers = await Promise.all(
        FONT_FILES.map(async (path) => {
          const res = await fetch(new URL(path, SITE_URL), { signal: AbortSignal.timeout(5000) })
          if (!res.ok) throw new Error(`font ${path}: ${res.status}`)
          return new Uint8Array(await res.arrayBuffer())
        }),
      )
      return buffers
    })().catch((err) => {
      // Reset so a later request can retry; surface as "no fonts" for this call.
      fontsPromise = null
      throw err
    })
  }
  return fontsPromise
}

/** Render a flyer SVG to a PNG buffer with the bundled fonts (best-effort fonts). */
export async function renderFlyerPng(svg: string, width = 1080): Promise<Buffer> {
  let fontBuffers: Uint8Array[] | undefined
  try {
    fontBuffers = await loadFonts()
  } catch {
    fontBuffers = undefined // degrade to no-font render rather than failing the download
  }
  return rasterizeSvg(svg, { width, fontBuffers, defaultFontFamily: 'Liberation Sans' })
}
