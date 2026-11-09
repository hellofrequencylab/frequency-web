#!/usr/bin/env node
// FIXTURE RENDER, step 2 for the New World Looks (LIVE-2175): open every <dir>/*.html from new-world-looks.render.tsx at 1440 and 390,
// report horizontal overflow and broken images, and write a full-page PNG beside each (<name>__<width>.png), or into SHOTS_OUT.
// Animations are frozen at their start so two runs draw the same picture.
// Usage: [SHOTS_OUT=<dir>] [CHROMIUM_PATH=...] node scripts/render/new-world-looks-shots.mjs <dir>
import { chromium } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { mkdirSync, readdirSync } from 'node:fs'

const dir = process.argv[2]
if (!dir) {
  console.error('usage: node scripts/render/new-world-looks-shots.mjs <dir>')
  process.exit(2)
}
const outDir = process.env.SHOTS_OUT ?? dir
mkdirSync(outDir, { recursive: true })
const files = readdirSync(dir).filter((f) => f.endsWith('.html'))
const WIDTHS = [1440, 390]
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const problems = []
for (const f of files) {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    await page.goto(pathToFileURL(`${dir}/${f}`).href, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(300)
    const r = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      broken: [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute('src')),
    }))
    if (r.overflow > 0) problems.push(`${f} @${width}: overflows by ${r.overflow}px`)
    if (r.broken.length) problems.push(`${f} @${width}: broken image ${r.broken.join(', ')}`)
    await page.screenshot({ path: `${outDir}/${f.replace('.html', '')}__${width}.png`, fullPage: true, animations: 'disabled' })
    await page.close()
  }
}
await browser.close()
console.log(problems.length ? problems.join('\n') : `${files.length} pages x ${WIDTHS.length} widths: no overflow, no broken images`)
process.exit(problems.length ? 1 : 0)
