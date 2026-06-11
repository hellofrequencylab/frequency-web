// One-off generator for Vera's avatar. resvg-wasm rasterizes her on-brand SVG (a warm
// sparkle, matching her Sparkles identity across the app) to a committed PNG, so the
// avatar renders through the normal next/image pipeline (SVG isn't enabled there).
// Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/gen-vera-avatar.mts
import { Resvg, initWasm } from '@resvg/resvg-wasm'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const wasmPath = join(dirname(require.resolve('@resvg/resvg-wasm')), 'index_bg.wasm')
await initWasm(await readFile(wasmPath))

// 512×512, cropped to a circle by the avatar container. Warm radial orange ground with
// a soft cream sparkle (the four-point star Vera carries everywhere) plus two smaller
// glints — present, a little dry, never confetti.
const svg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="36%" r="78%">
      <stop offset="0%" stop-color="#F6B775"/>
      <stop offset="58%" stop-color="#EA8C46"/>
      <stop offset="100%" stop-color="#D8702D"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <path d="M256 116 C 270 198, 314 242, 396 256 C 314 270, 270 314, 256 396 C 242 314, 198 270, 116 256 C 198 242, 242 198, 256 116 Z" fill="#FFF7EC" fill-opacity="0.97"/>
  <path d="M150 148 C 155 168, 168 181, 188 186 C 168 191, 155 204, 150 224 C 145 204, 132 191, 112 186 C 132 181, 145 168, 150 148 Z" fill="#FFF7EC" fill-opacity="0.82"/>
  <path d="M374 322 C 377 335, 386 344, 399 347 C 386 350, 377 359, 374 372 C 371 359, 362 350, 349 347 C 362 344, 371 335, 374 322 Z" fill="#FFF7EC" fill-opacity="0.7"/>
</svg>`

const png = new Resvg(svg, { fitTo: { mode: 'width', value: 512 } }).render().asPng()
await writeFile(join(process.cwd(), 'public/vera-avatar.png'), png)
console.log(`wrote public/vera-avatar.png (${png.length} bytes)`)
