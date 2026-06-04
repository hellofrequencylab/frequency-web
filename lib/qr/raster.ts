// Server-side styled-PNG rasterizer (QR backlog #4). Renders the designed SVG
// (lib/qr/render-styled.ts) to PNG via @resvg/resvg-wasm — the only way to keep the
// gradients/shapes/logo in a raster. Server-only (wasm + fs); the route that calls
// this falls back to a plain PNG if anything here throws, so downloads never break.

import { Resvg, initWasm } from '@resvg/resvg-wasm'
import { renderStyledQrSvg } from './render-styled'
import { isSafeLogoSrc, type QrStyle } from './style'

// Init the wasm once per process. resvg's initWasm throws if called twice, so guard
// behind a single promise.
let wasmReady: Promise<void> | null = null
async function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = (async () => {
      const { readFile } = await import('node:fs/promises')
      const { createRequire } = await import('node:module')
      const { dirname, join } = await import('node:path')
      const require = createRequire(import.meta.url)
      // Resolve the package ENTRY (external, never bundled) and derive the wasm path
      // from it — avoids a literal `.wasm` specifier that the bundler would try to
      // trace (and choke on the wasm-bindgen `wbg` glue).
      const wasmPath = join(dirname(require.resolve('@resvg/resvg-wasm')), 'index_bg.wasm')
      await initWasm(await readFile(wasmPath))
    })()
  }
  await wasmReady
}

// The rasterizer can't load a remote <image href>, so fetch the logo and inline it
// as a data URL. Returns null on any failure → the code renders without a logo
// rather than producing a broken PNG.
async function inlineLogo(src: string): Promise<string | null> {
  if (src.startsWith('data:')) return src
  try {
    const res = await fetch(src, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? 'image/png'
    if (!type.startsWith('image/')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > 512 * 1024) return null // cap at 512KB
    return `data:${type};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

/** Render a QR for `text` with `style` as a PNG buffer (gradients, shapes, logo). */
export async function renderStyledQrPng(text: string, style: QrStyle, size = 1024): Promise<Buffer> {
  let effective = style
  if (style.logo && isSafeLogoSrc(style.logo)) {
    effective = { ...style, logo: await inlineLogo(style.logo) }
  }
  const svg = renderStyledQrSvg(text, effective, size)
  await ensureWasm()
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
  return Buffer.from(r.render().asPng())
}
