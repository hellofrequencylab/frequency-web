#!/usr/bin/env node
// FIXTURE RENDER, step 3 for the Network Theme Kit pictures: screenshot <dir>/<kit>-spacedesk.html (1280x770) and
// <dir>/<kit>-email.html (900x1140) into public/themes/network-kit/shots/<kit>-spacedesk.jpg and <kit>-email.jpg.
// The pages draw the shell's icons and fonts from /brand and /sites, so serve <dir> over http with those two symlinked in
// (python3 -m http.server) and pass its address as the second argument.
// Usage: node scripts/render/network-kit-shots.mjs <dir> <http://127.0.0.1:port>
import { chromium } from '@playwright/test'

const dir = process.argv[2]
const base = process.argv[3]
if (!dir || !base) {
  console.error('usage: node scripts/render/network-kit-shots.mjs <dir> <base-url>')
  process.exit(2)
}
const kits = ['general', 'networks', 'clubs', 'markets', 'hosts', 'creators', 'wellness', 'studios', 'nonprofits', 'schools', 'coaches', 'venues', 'faith']
const shots = { spacedesk: { width: 1280, height: 770 }, email: { width: 900, height: 1140 } }
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
for (const kit of kits) {
  for (const [name, { width, height }] of Object.entries(shots)) {
    const page = await browser.newPage({ viewport: { width, height } })
    await page.goto(`${base}/${kit}-${name}.html`, { waitUntil: 'load' })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `public/themes/network-kit/shots/${kit}-${name}.jpg`, type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width, height } })
    await page.close()
  }
}
await browser.close()
console.log('wrote 26 pictures')
