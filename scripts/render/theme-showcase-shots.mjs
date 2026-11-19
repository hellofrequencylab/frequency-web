#!/usr/bin/env node
// FIXTURE RENDER, step 2 for the /themes showcase (kit-showcase): screenshot <dir>/<theme>-{site,spot,email}.html from
// theme-pages-shots.render.tsx into public/themes-index/s/themes/<dir>/shots/<accent>-{site,spot,email}.webp at the showcase's sizes
// (site 1280x800, spot 741x1649, email 900x2250). Usage: node scripts/render/theme-showcase-shots.mjs <dir> <theme> <showcase dir> <accent>
// Serves <dir> with /brand, /sites, /themes from public/ and /fonts from app/fonts, like theme-pages-shots.mjs.
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'

const [dir, theme, showcase, accent] = process.argv.slice(2)
if (!dir || !theme || !showcase || !accent) {
  console.error('usage: node scripts/render/theme-showcase-shots.mjs <dir> <theme> <showcase dir> <accent>')
  process.exit(2)
}
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
  const file = /^\/(brand|sites|themes|create-a-space)\//.test(path) ? join('public', path) : path.startsWith('/fonts/') ? join('app', path) : join(dir, path)
  let body
  try {
    body = readFileSync(file)
  } catch {
    res.writeHead(404).end()
    return
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const out = `public/themes-index/s/themes/${showcase}/shots`
mkdirSync(out, { recursive: true })
// SHOTS=site,email limits which of the three are written (Mindless's website comes from mindless-home.render.tsx instead).
const only = process.env.SHOTS ? process.env.SHOTS.split(',') : null
const shots = {
  site: { file: 'site', width: 1280, height: 800, scale: 1, out: [1280, 800] },
  spot: { file: 'spot', width: 390, height: 868, scale: 1.9, out: [741, 1649] },
  email: { file: 'email', width: 900, height: 2250, scale: 1, out: [900, 2250] },
}
for (const [key, s] of Object.entries(shots).filter(([k]) => !only || only.includes(k))) {
  const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: s.scale })
  // The website and email pages name their pictures as file:// paths (theme-pages-shots.render.tsx), so they open from disk; the Spotlight reads the served app.css.
  await page.goto(key === 'spot' ? `${base}/${theme}-${s.file}.html` : pathToFileURL(`${dir}/${theme}-${s.file}.html`).href, { waitUntil: 'load' })
  await page.waitForTimeout(600)
  await page.evaluate(() => document.fonts.ready)
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: s.width, height: s.height } })
  await sharp(png).resize(s.out[0], s.out[1], { fit: 'cover', position: 'top' }).webp({ quality: 78 }).toFile(`${out}/${accent}-${key}.webp`)
  await page.close()
}
await browser.close()
server.close()
console.log(`wrote ${out}/${accent}-{site,spot,email}.webp`)
