#!/usr/bin/env node
// FIXTURE RENDER, step 3: screenshot an HTML file (or URL) full-page at phone and desktop widths.
// Usage: node scripts/render/shot.mjs <file.html|url> <out-prefix>   -> <prefix>-390.png, <prefix>-1280.png
import { chromium } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const [target, prefix] = process.argv.slice(2)
if (!target || !prefix) {
  console.error('usage: node scripts/render/shot.mjs <file.html|url> <out-prefix>')
  process.exit(2)
}
const url = /^https?:|^file:/.test(target) ? target : pathToFileURL(resolve(target)).href
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
for (const width of [390, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${prefix}-${width}.png`, fullPage: true })
  await page.close()
}
await browser.close()
console.log(`wrote ${prefix}-390.png and ${prefix}-1280.png`)
