#!/usr/bin/env node
// FIXTURE RENDER, step 2 for the Services design pass: open every <dir>/<kit>__<slug>__<register>.html at 390, 1280, 1440, 1920 and 2000,
// report horizontal overflow and broken images, and (with SHOTS=1) write full-page JPEGs beside the HTML.
// Usage: [SHOTS=1] [KITS=general,trades] node scripts/render/services-kit-pages-shots.mjs <dir>
import { chromium } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { readdirSync } from 'node:fs'

const dir = process.argv[2]
if (!dir) {
  console.error('usage: node scripts/render/services-kit-pages-shots.mjs <dir>')
  process.exit(2)
}
const only = process.env.KITS ? new Set(process.env.KITS.split(',')) : null
const files = readdirSync(dir).filter((f) => f.endsWith('.html') && (!only || only.has(f.split('__')[0])))
const WIDTHS = [390, 1280, 1440, 1920, 2000]
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const problems = []
for (const f of files) {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    await page.goto(pathToFileURL(`${dir}/${f}`).href, { waitUntil: 'load' })
    await page.waitForTimeout(250)
    const r = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      broken: [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute('src')),
    }))
    if (r.overflow > 0) problems.push(`${f} @${width}: overflows by ${r.overflow}px`)
    if (r.broken.length) problems.push(`${f} @${width}: broken image ${r.broken.join(', ')}`)
    if (process.env.SHOTS) await page.screenshot({ path: `${dir}/${f.replace('.html', '')}__${width}.jpg`, type: 'jpeg', quality: 70, fullPage: true })
    await page.close()
  }
}
await browser.close()
console.log(problems.length ? problems.join('\n') : `${files.length} pages x ${WIDTHS.length} widths: no overflow, no broken images`)
process.exit(problems.length ? 1 : 0)
