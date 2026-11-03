#!/usr/bin/env node
// FIXTURE RENDER, step 2 for the New World pictures: screenshot <dir>/<kit>-site.html (1280x800), <kit>-spot.html (390x844 at 2x,
// 780x1688) and <kit>-email.html (900x1140) into public/brand/new-world-kit/shots/<kit>-{site,spot,email}.jpg.
// The Space pages (new-world-space-shots.render.tsx) read the app's compiled CSS and the public assets over http, so this serves <dir>
// with /brand, /sites, /themes from public/ and /fonts from app/fonts, and writes <kit>-spacedesk.jpg (1280x770) too.
// Usage: node scripts/render/new-world-theme-shots.mjs <dir>
import { chromium } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { mkdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const dir = process.argv[2]
if (!dir) {
  console.error('usage: node scripts/render/new-world-theme-shots.mjs <dir>')
  process.exit(2)
}
const kits = ['general', 'coaches', 'studios', 'hosts', 'venues', 'nonprofits', 'networks']
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
  const file = /^\/(brand|sites|themes)\//.test(path) ? join('public', path) : path.startsWith('/fonts/') ? join('app', path) : join(dir, path)
  // One read, no existence check first: a check then a read is a race (CodeQL js/file-system-race).
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
const shots = { site: { width: 1280, height: 800, scale: 1 }, spot: { width: 390, height: 844, scale: 2 }, email: { width: 900, height: 1140, scale: 1 }, spacedesk: { width: 1280, height: 770, scale: 1 } }
mkdirSync('public/brand/new-world-kit/shots', { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
for (const kit of kits) {
  for (const [name, { width, height, scale }] of Object.entries(shots)) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale })
    await page.goto(name === 'spacedesk' ? `${base}/${kit}-${name}.html` : pathToFileURL(`${dir}/${kit}-${name}.html`).href, { waitUntil: 'load' })
    await page.waitForTimeout(500)
    await page.screenshot({ path: `public/brand/new-world-kit/shots/${kit}-${name}.jpg`, type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width, height } })
    await page.close()
  }
}
mkdirSync('public/brand/new-world-kit/layouts', { recursive: true })
for (const id of ['stack', 'card-wall', 'story', 'calendar-first', 'shop-front', 'profile']) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  await page.goto(pathToFileURL(`${dir}/layout-${id}.html`).href, { waitUntil: 'load' })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `public/brand/new-world-kit/layouts/${id}.jpg`, type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 390, height: 844 } })
  await page.close()
}
await browser.close()
server.close()
console.log('wrote 34 pictures')
