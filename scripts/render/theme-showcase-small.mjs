#!/usr/bin/env node
// Phone copies for the /themes showcase (kit-showcase). Writes <name>.sm.webp beside every .webp under public/themes-index at half
// width (never under 320px), so a phone loads about a third of the bytes. kit-showcase/st.ts points phone widths at these copies;
// desktop keeps the full files. Static files shrunk once here, never through the paid image optimizer.
// Usage: node scripts/render/theme-showcase-small.mjs [--force]   (skips copies that are already newer than their source)
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { invokedDirectly } from '../lib/invoked-directly.mjs'

const ROOT = 'public/themes-index'
const force = process.argv.includes('--force')

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (e.name.endsWith('.webp') && !e.name.endsWith('.sm.webp')) yield p
  }
}

export async function smallCopy(src) {
  const out = src.replace(/\.webp$/, '.sm.webp')
  const meta = await sharp(src).metadata()
  const w = Math.max(Math.round((meta.width ?? 0) / 2), Math.min(meta.width ?? 0, 320))
  await sharp(src).resize({ width: w }).webp({ quality: 70 }).toFile(out)
  return out
}

if (invokedDirectly(import.meta.url)) {
  let n = 0
  let before = 0
  let after = 0
  for (const src of walk(ROOT)) {
    const out = src.replace(/\.webp$/, '.sm.webp')
    let fresh = false
    try { fresh = !force && statSync(out).mtimeMs >= statSync(src).mtimeMs } catch {}
    if (!fresh) await smallCopy(src)
    before += statSync(src).size
    after += statSync(out).size
    n++
  }
  console.log(`${n} phone copies, ${(before / 1e6).toFixed(2)} MB full, ${(after / 1e6).toFixed(2)} MB phone`)
}
