import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// THE MENSWORK SHARE CARD'S FACES (LIVE-870). The theme's display face (Sofia Sans Extra Condensed 800)
// and body face (Barlow 500), committed under public/fonts and read from disk, never fetched, for the
// same reasons as load-stage-fonts.ts. Each read is a LITERAL path so @vercel/nft ships exactly these two
// files to the route that opens them and globs nothing. Memoised once a read succeeds.

const detach = (buf: Buffer): ArrayBuffer => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer

const readDisplay = () => readFile(join(process.cwd(), 'public/fonts', 'SofiaSansExtraCondensed-ExtraBold.ttf')).then(detach)
const readBody = () => readFile(join(process.cwd(), 'public/fonts', 'Barlow-Medium.ttf')).then(detach)

let cached: { display: ArrayBuffer; body: ArrayBuffer } | null = null

/** Both faces. Rejects when a file is missing, so the route answers 500 and the previewer falls back to a
 *  text card, rather than handing Satori an empty font list. */
export async function loadMensworkFonts(): Promise<{ display: ArrayBuffer; body: ArrayBuffer }> {
  if (cached) return cached
  const [display, body] = await Promise.all([readDisplay(), readBody()])
  cached = { display, body }
  return cached
}
