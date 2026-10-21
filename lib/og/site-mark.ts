import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// The Frequency mark drawn top-right on every card, inlined for Satori. Its own module, not part of
// lib/og/local-image.ts: importing that one ships all six site cover photos into every function that
// draws a card, and check:build-fanout caps the public/ files one function carries at 14. Literal path,
// so @vercel/nft traces exactly this file.
export async function siteMarkDataUrl(): Promise<string> {
  const data = await readFile(join(process.cwd(), 'public/images', 'Frequency-Logo-Round-Icon-white.png'))
  return `data:image/png;base64,${data.toString('base64')}`
}
