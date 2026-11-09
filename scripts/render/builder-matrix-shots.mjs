#!/usr/bin/env node
// BLD-901 FULL MATRIX, step 2. Opens each <theme>.html from builder-matrix.render.tsx at every declared width, measures
// each <section data-cell> for horizontal overflow, zero height and text contrast, and reports coverage over cells.json.
// CHROMIUM_PATH overrides the browser (e.g. /opt/pw-browsers/chromium). Exits 1 on any overflow, zero-height section or uncovered cell; contrast findings are listed and fail under CONTRAST_FAIL.
// Usage: node scripts/render/builder-matrix-shots.mjs <dir> [--json <file>]
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const dir = resolve(process.argv[2] ?? '.')
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null
const cells = JSON.parse(readFileSync(`${dir}/cells.json`, 'utf8'))
const themes = [...new Set(cells.map((c) => c.theme))]
const widths = [...new Set(cells.map((c) => c.width))].sort((a, b) => b - a)
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const measured = new Set()
const findings = []

// Runs in the page: one record per section at the current width.
function measure() {
  const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  probe.canvas.width = probe.canvas.height = 1
  const paint = (v) => { probe.fillStyle = v }
  const rgba = (css) => { probe.clearRect(0, 0, 1, 1); paint('#000'); paint(css); probe.fillRect(0, 0, 1, 1); const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data; return [r, g, b, a / 255] }
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const over = (top, bottom) => { const a = top[3]; return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1) }
  const scrolls = (e) => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true } return false }
  const w = document.documentElement.clientWidth
  const backdrop = (el) => {
    // The first opaque background up the tree; null when an image or gradient sits in the way (not measurable).
    let layers = []
    for (let a = el; a; a = a.parentElement) {
      const cs = getComputedStyle(a)
      if (cs.backgroundImage !== 'none') return null
      const c = rgba(cs.backgroundColor)
      if (c[3] > 0) { layers.push(c); if (c[3] >= 1) break }
    }
    let base = [255, 255, 255, 1]
    for (const l of layers.reverse()) base = over(l, base)
    return base
  }
  const out = []
  for (const section of document.querySelectorAll('section[data-cell]')) {
    const rect = section.getBoundingClientRect()
    const wide = [...section.querySelectorAll('*')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > w + 1 && !scrolls(e) }).slice(0, 3).map((e) => e.getAttribute('data-part') || e.tagName.toLowerCase())
    const low = []
    const seen = new Set()
    for (const el of section.querySelectorAll('*')) {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue
      const bg = backdrop(el)
      if (!bg) continue
      const fg = over(rgba(cs.color), bg)
      const l1 = lum(fg), l2 = lum(bg)
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
      const px = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700
      const need = px >= 24 || (px >= 18.66 && bold) ? 3 : 4.5
      const text = el.textContent.trim().slice(0, 24)
      if (ratio < need && !seen.has(text)) { seen.add(text); low.push({ text, ratio: Math.round(ratio * 100) / 100, need }) }
    }
    out.push({ cell: section.getAttribute('data-cell'), height: Math.round(rect.height), wide, low: low.slice(0, 3) })
  }
  return { sections: out, scroll: document.documentElement.scrollWidth - w }
}

for (const theme of themes) {
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    await page.goto(pathToFileURL(`${dir}/${theme}.html`).href)
    const { sections, scroll } = await page.evaluate(measure)
    await page.close()
    if (scroll > 0) findings.push({ kind: 'overflow', theme, width, cell: '(page)', detail: `+${scroll}px` })
    for (const s of sections) {
      const [role, variant] = s.cell.split(':')
      measured.add(`${role}:${variant}:${theme}:${width}`)
      if (s.height < 8) findings.push({ kind: 'zero-height', theme, width, cell: s.cell, detail: `${s.height}px` })
      if (s.wide.length) findings.push({ kind: 'overflow', theme, width, cell: s.cell, detail: s.wide.join(',') })
      for (const l of s.low) findings.push({ kind: 'contrast', theme, width, cell: s.cell, detail: `${l.ratio}:1 under ${l.need}:1 on "${l.text}"` })
    }
  }
}
await browser.close()

const need = cells.filter((c) => c.shows === 'draw' || c.shows === 'freeze')
const covered = need.filter((c) => measured.has(`${c.role}:${c.variant}:${c.theme}:${c.width}`)).length
const declared = cells.length
const ratio = (declared - need.length + covered) / declared
const by = (k) => findings.filter((f) => f.kind === k).length
console.log(`matrix: ${declared} cells declared, ${need.length} drawn as blocks, coverage ${ratio.toFixed(2)}; ${by('overflow')} overflow, ${by('zero-height')} zero-height, ${by('contrast')} contrast finding(s)`)
for (const f of findings.slice(0, Number(process.env.SHOW ?? 40))) console.log(`${f.kind.toUpperCase()} ${f.theme} ${f.cell} @${f.width}: ${f.detail}`)
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ declared, covered: declared - need.length + covered, ratio, findings }, null, 1))
const CONTRAST_FAIL = process.env.CONTRAST_FAIL === '1'
process.exit(ratio < 1 || by('overflow') || by('zero-height') || (CONTRAST_FAIL && by('contrast')) ? 1 : 0)
