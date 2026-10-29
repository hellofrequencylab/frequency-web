#!/usr/bin/env node
// pnpm audit:themes (LIVE-1850, docs/THEME-COHESION.md): render every block on every theme with real content,
// score coverage, hold the hole baseline, and optionally shoot contact sheets.
//
//   pnpm audit:themes                    render + coverage + baseline check (no browser)
//   pnpm audit:themes --sheets           also shoot each block and write one contact sheet per palette category
//   pnpm audit:themes --update-baseline  drop fixed holes from the baseline; refuses to add one
//   --width=390                          shot width for --sheets (default 1280)
//
// Output goes to .theme-audit/ (coverage.json, <theme>/<category>.html, shots-<width>/, sheet-<category>.png).
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const OUT = path.join(root, '.theme-audit')
const args = process.argv.slice(2)
const flag = (n) => args.includes(`--${n}`)
const width = Number((args.find((a) => a.startsWith('--width=')) ?? '--width=1280').split('=')[1])
const require = createRequire(path.join(root, 'package.json'))

fs.mkdirSync(OUT, { recursive: true })

// 1. The global Tailwind output, so shots look like the site. Skipped quietly if the toolchain is not resolvable.
try {
  const twDir = path.dirname(require.resolve('@tailwindcss/postcss'))
  const postcss = createRequire(path.join(twDir, 'x.js'))('postcss')
  const tw0 = await import(pathToFileURL(require.resolve('@tailwindcss/postcss')).href)
  const tw = tw0.default ?? tw0
  const src = fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8')
  const r = await postcss([tw({ base: root })]).process(src, { from: path.join(root, 'app/globals.css') })
  fs.writeFileSync(path.join(OUT, 'global.css'), r.css)
} catch (e) {
  console.warn(`audit:themes: no global Tailwind CSS (${e.message}); shots will lack utility classes`)
}

// 2. Render matrix, coverage and the baseline check.
const run = spawnSync('npx', ['vitest', 'run', '--config', 'scripts/theme-audit/vitest.config.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, THEME_AUDIT_OUT: OUT, THEME_AUDIT_UPDATE: flag('update-baseline') ? '1' : '' },
})
const cov = fs.existsSync(path.join(OUT, 'coverage.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'coverage.json'), 'utf8')) : null
if (cov) {
  console.log(`audit:themes: ${Object.keys(cov.blocks).length} blocks x ${cov.themes.length} themes, ${cov.holes.length} holes (below ${cov.holeBelow}), ${cov.fixed.length} fixed since the baseline, ${cov.added.length} new`)
  if (cov.fixed.length && !flag('update-baseline')) console.log('audit:themes: holes fixed; run pnpm audit:themes --update-baseline to bank them')
}
if (run.status !== 0) process.exit(run.status ?? 1)

// 3. Contact sheets.
if (flag('sheets')) {
  const { chromium } = require('playwright')
  const THEMES = cov.themes
  const cats = [...new Set(Object.values(cov.blocks).map((b) => b.cat))]
  const browser = await chromium.launch()
  const shots = path.join(OUT, `shots-${width}`)
  const heights = {}
  await Promise.all(THEMES.map(async (t) => {
    const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage()
    for (const c of cats) {
      const f = path.join(OUT, t, `${c}.html`)
      if (!fs.existsSync(f)) continue
      await page.goto(`file://${f}`, { waitUntil: 'load' })
      await page.addStyleTag({ content: '.audit-tag{position:static!important} *{animation:none!important;transition:none!important} .site-doc-section{opacity:1!important;transform:none!important}' })
      for (const row of await page.locator('[data-block]').all()) {
        const b = await row.getAttribute('data-block')
        const box = await row.boundingBox()
        if (!box) continue
        fs.mkdirSync(path.join(shots, t), { recursive: true })
        try {
          await page.screenshot({ path: path.join(shots, t, `${b}.png`), clip: { x: 0, y: box.y, width, height: Math.min(Math.ceil(box.height), 1600) }, fullPage: true })
          ;(heights[b] ??= {})[t] = true
        } catch { /* a block that cannot be shot shows as "no render" on the sheet */ }
      }
    }
  }))
  const colw = width <= 480 ? 200 : 300
  for (const c of cats) {
    const names = Object.entries(cov.blocks).filter(([, b]) => b.cat === c).map(([n]) => n)
    const head = THEMES.map((t) => `<div>${t}</div>`).join('')
    const rows = names.map((b) => `<div class=r><div class=n>${b}</div>${THEMES.map((t) => {
      const p = path.join(shots, t, `${b}.png`)
      const v = cov.blocks[b].coverage[t]
      return `<div class=c><span class=l>${v == null ? 'n/a' : v}</span>${fs.existsSync(p) ? `<img src="file://${p}">` : '<i>no render</i>'}</div>`
    }).join('')}</div>`).join('')
    const html = `<style>body{margin:0;font:600 12px system-ui}.r{display:flex;border-bottom:2px solid #000}.c{width:${colw}px;border-right:1px solid #999;position:relative;overflow:hidden}.c img{width:${colw}px;display:block}.l{position:absolute;top:0;left:0;background:#000;color:#fff;padding:1px 4px;font-size:10px}.h{display:flex}.h div{width:${colw}px;padding:4px}.n{width:90px;padding:4px;word-break:break-all;background:#eef}i{padding:20px;display:block}</style><div class=h><div style="width:90px"></div>${head}</div>${rows}`
    const out = path.join(OUT, `sheet-${c}.html`)
    fs.writeFileSync(out, html)
    const page = await browser.newPage({ viewport: { width: 90 + colw * THEMES.length, height: 800 } })
    await page.goto(`file://${out}`)
    await page.screenshot({ path: path.join(OUT, `sheet-${c}.png`), fullPage: true })
    await page.close()
  }
  await browser.close()
  console.log(`audit:themes: ${cats.length} contact sheets in ${path.relative(root, OUT)}/sheet-*.png`)
}
