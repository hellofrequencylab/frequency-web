#!/usr/bin/env node
// FIXTURE RENDER, step 2 for the Bold, Wildheart and Services theme pictures: screenshot <dir>/<theme>-site.html (1280x800), <theme>-spot.html (390x844 at 2x,
// 780x1688) and <theme>-email.html (900x760) into public/brand/theme-pages/<theme>/{site,spot,email,spacedesk}.jpg.
// The Space pages (new-world-space-shots.render.tsx) read the app's compiled CSS and the public assets over http, so this serves <dir>
// with /brand, /sites, /themes from public/ and /fonts from app/fonts, and writes <kit>-spacedesk.jpg (1280x770) too.
// Usage: node scripts/render/theme-pages-shots.mjs <dir>
import { chromium } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const dir = process.argv[2]
if (!dir) {
  console.error('usage: node scripts/render/theme-pages-shots.mjs <dir>')
  process.exit(2)
}
// THEME_ONLY=<id> writes one theme's pictures and leaves the others as they are.
const themes = ['bold', 'wildheart', 'services', 'cyberwitch'].filter((t) => !process.env.THEME_ONLY || t === process.env.THEME_ONLY)
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
  const file = /^\/(brand|sites|themes|create-a-space)\//.test(path) ? join('public', path) : path.startsWith('/fonts/wildheart/') ? join('public', path) : path.startsWith('/fonts/') ? join('app', path) : join(dir, path)
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
const shots = { site: { width: 1280, height: 800, scale: 1 }, spot: { width: 390, height: 844, scale: 2 }, email: { width: 900, height: 760, scale: 1 }, spacedesk: { width: 1280, height: 770, scale: 1 } }
const FONTS_CSS = `@font-face{font-family:Unbounded;src:url(/fonts/unbounded/unbounded.woff2) format("woff2");font-weight:200 900}@font-face{font-family:"Hanken Grotesk";src:url(/fonts/hanken-grotesk/hanken-grotesk.woff2) format("woff2");font-weight:100 900}@font-face{font-family:"Instrument Serif";src:url(/fonts/instrument-serif/instrument-serif-italic.woff2) format("woff2");font-style:italic}`
const bold = (fam, f, w) => `@font-face{font-family:"${fam}";src:url(/fonts/${f}) format("woff2");font-weight:${w}}`
const BOLD_CSS =
  bold('Sofia Sans Extra Condensed', 'sofia-sans-extra-condensed/sofia-sans-extra-condensed.woff2', '1 1000') +
  [400, 500, 600].map((w) => bold('Barlow', `barlow/barlow-${w}.woff2`, w)).join('') +
  [400, 500].map((w) => bold('IBM Plex Mono', `ibm-plex-mono/ibm-plex-mono-${w}.woff2`, w)).join('') +
  ':root{--font-sofia-xc:"Sofia Sans Extra Condensed";--font-barlow:Barlow;--font-plex-mono:"IBM Plex Mono"}'
const WH_CSS =
  ['Regular:normal', 'Italic:italic'].map((v) => `@font-face{font-family:"IM Fell English";src:url(/fonts/wildheart/IMFellEnglish-${v.split(':')[0]}.ttf) format("truetype");font-style:${v.split(':')[1]};font-weight:400}`).join('') +
  `@font-face{font-family:"EB Garamond";src:url(/fonts/eb-garamond/eb-garamond.woff2) format("woff2");font-weight:400 800}@font-face{font-family:"EB Garamond";src:url(/fonts/eb-garamond/eb-garamond-italic.woff2) format("woff2");font-style:italic;font-weight:400 800}@font-face{font-family:"Noto Sans Symbols";src:url(/fonts/noto-sans-symbols/noto-sans-symbols.woff2) format("woff2");font-weight:100 900}@font-face{font-family:"Playfair Display";src:url(/fonts/playfair-display/playfair-display.woff2) format("woff2");font-weight:400 900}`
const CW_CSS =
  '@font-face{font-family:UnifrakturCook;src:url(/fonts/unifrakturcook/unifrakturcook-700.woff2) format("woff2");font-weight:700}@font-face{font-family:"Permanent Marker";src:url(/fonts/permanent-marker/permanent-marker-400.woff2) format("woff2");font-weight:400}' +
  [400, 500, 600, 700].map((w) => `@font-face{font-family:Spectral;src:url(/fonts/spectral/spectral-${w}.woff2) format("woff2");font-weight:${w}}`).join('')
writeFileSync(join(dir, 'fonts.css'), FONTS_CSS + BOLD_CSS + WH_CSS + CW_CSS)
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
// CW_ACCENT (with THEME_ONLY=cyberwitch) writes that neon's pictures under public/brand/theme-pages/cyberwitch/<accent>/.
const cwAccent = process.env.CW_ACCENT && process.env.CW_ACCENT !== 'hex' ? process.env.CW_ACCENT : null
for (const t of themes) {
  const outDir = t === 'cyberwitch' && cwAccent ? `public/brand/theme-pages/${t}/${cwAccent}` : `public/brand/theme-pages/${t}`
  mkdirSync(outDir, { recursive: true })
  for (const [name, { width, height, scale }] of Object.entries(shots)) {
    // Bold's website picture is taken at 1.25x the frame and scaled back, so the headline AND the photo under it sit in the window.
    const zoom = (t === 'bold' || t === 'wildheart') && name === 'site' ? 1.25 : 1
    const page = await browser.newPage({ viewport: { width: width * zoom, height: height * zoom }, deviceScaleFactor: scale / zoom })
    await page.goto(name === 'spacedesk' || name === 'spot' ? `${base}/${t}-${name}.html` : pathToFileURL(`${dir}/${t}-${name}.html`).href, { waitUntil: 'load' })
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${outDir}/${name}.jpg`, type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: width * zoom, height: height * zoom } })
    await page.close()
  }
}
await browser.close()
server.close()
console.log(`wrote ${themes.length * 4} pictures`)
