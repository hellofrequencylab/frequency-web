#!/usr/bin/env node
// SCAN-1032 route-family runtime and visual audit.
// Usage: BASE_URL=http://localhost:3000 node scripts/audit/route-family-audit.mjs [--out audit-out] [--routes /a,/b]
// Visits each public route family at 390 and 1280 and records, per route and viewport:
//   HTTP status, console errors, page errors, horizontal overflow, axe serious/critical violations,
//   and a full-page screenshot. Writes <out>/report.json, <out>/report.md and <out>/shots/*.png.
// Set CHROMIUM_PATH to use a specific Chrome binary instead of Playwright's own.
// It reads and renders only; it never submits a form and never signs in. Point it at a local
// `pnpm dev` or a preview URL. Signed-in and admin families need a session and are not covered here.
import { chromium } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const OUT = arg('--out', 'audit-out')
const ROUTES = (arg('--routes', '') || '').split(',').filter(Boolean)
export const DEFAULT_ROUTES = [
  '/', '/pricing', '/features', '/about', '/what-is-frequency', '/create-a-space', '/themes', '/start',
  '/stories', '/the-community', '/loneliness', '/friendship-as-an-adult', '/how-to-start-a-circle',
  '/how-to-build-community', '/how-to-be-more-social', '/tools-for-community-builders',
  '/discover', '/events', '/guidelines', '/privacy', '/accessibility', '/sign-in',
]
const VIEWPORTS = [{ name: '390', width: 390, height: 844 }, { name: '1280', width: 1280, height: 900 }]
const slug = (r) => (r === '/' ? 'home' : r.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-'))

mkdirSync(join(OUT, 'shots'), { recursive: true })
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const rows = []
for (const route of ROUTES.length ? ROUTES : DEFAULT_ROUTES) {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 })
    const page = await ctx.newPage()
    const consoleErrors = []
    const pageErrors = []
    // axe-core fetches cross-origin stylesheets to read their rules, and the CSP's connect-src blocks that
    // fetch. The page's own <link> loads fine (SCAN-1204: 0 violations without axe, 1 with), so it is noise.
    page.on('console', (m) => {
      if (m.type() !== 'error') return
      const t = m.text()
      if (/Connecting to 'https:\/\/fonts\.googleapis\.com\//.test(t)) return
      consoleErrors.push(t.slice(0, 300))
    })
    page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)))
    const row = { route, viewport: vp.name, status: null, overflowPx: 0, consoleErrors, pageErrors, axe: [], shot: null, error: null }
    try {
      const res = await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 60000 })
      row.status = res ? res.status() : null
      row.overflowPx = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth))
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      row.axe = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help }))
      row.shot = `shots/${slug(route)}-${vp.name}.png`
      await page.screenshot({ path: join(OUT, row.shot), fullPage: true })
    } catch (e) {
      row.error = String(e).slice(0, 300)
    }
    rows.push(row)
    await ctx.close()
  }
}
await browser.close()

const bad = (r) => r.error || (r.status && r.status >= 400) || r.overflowPx > 0 || r.pageErrors.length || r.axe.length
const md = ['# Route family audit', '', `Base: ${BASE}`, `Routes: ${new Set(rows.map((r) => r.route)).size}, rows: ${rows.length}, with findings: ${rows.filter(bad).length}`, '',
  '| route | vp | status | overflow px | page errors | console errors | axe serious/critical |', '|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.route} | ${r.viewport} | ${r.error ? 'ERR' : r.status} | ${r.overflowPx} | ${r.pageErrors.length} | ${r.consoleErrors.length} | ${r.axe.map((a) => `${a.id}(${a.nodes})`).join(', ') || '-'} |`)]
writeFileSync(join(OUT, 'report.json'), JSON.stringify(rows, null, 2))
writeFileSync(join(OUT, 'report.md'), md.join('\n') + '\n')
console.log(md.slice(0, 4).join('\n'))
process.exitCode = rows.some(bad) ? 1 : 0
