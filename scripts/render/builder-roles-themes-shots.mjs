#!/usr/bin/env node
// Screenshots <dir>/<theme>.html at 390, 1280, 1440, 1920 and 2000, and reports horizontal overflow per width.
// Usage: node scripts/render/builder-roles-themes-shots.mjs <dir>
import { chromium } from '@playwright/test'
import { readdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
const dir = resolve(process.argv[2])
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
let bad = 0
for (const f of readdirSync(dir).filter((x) => x.endsWith('.html'))) {
  for (const width of [390, 1280, 1440, 1920, 2000]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    await page.goto(pathToFileURL(`${dir}/${f}`).href)
    const over = await page.evaluate(() => {
      const w = document.documentElement.clientWidth
      const scrolls = (e) => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return true } return false }
      const wide = [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > w + 1 && !scrolls(e)).slice(0, 3).map((e) => e.getAttribute('data-part') || e.tagName)
      return { scroll: document.documentElement.scrollWidth - w, wide }
    })
    if (over.scroll > 0 || over.wide.length) { bad++; console.log(`OVERFLOW ${f} ${width}: +${over.scroll}px`, over.wide.join(',')) }
    await page.screenshot({ path: `${dir}/${f.replace('.html', '')}-${width}.png`, fullPage: true })
    await page.close()
  }
}
await browser.close()
console.log(bad ? `${bad} overflow(s)` : 'no horizontal overflow at 390, 1280, 1440, 1920, 2000 in any theme')
