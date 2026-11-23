#!/usr/bin/env node
// SCAN-1262: the sitemap's four commerce sections (store, market, housing, classifieds) name every
// listing past the first 100, and help category pages carry a lastmod.
//
// REWRITTEN 2026-11-23 on the owner's answer ("Rewrite the SCAN-1262 check"). The first probe
// passed only when the text `COMMERCE_SITEMAP_CAP = 100` was gone from app/sitemap.ts. The done row
// SCAN-203 pins that same constant to the readers' clamps, so both could never pass on one tree,
// and the constant is now the page size of a walk, not a cap. This probe measures the consequence
// instead: it runs app/sitemap-commerce-walk.test.ts, which drives the real sitemap through the
// four real readers against a scripted database boundary and fails if a listing past the first
// page is missing, and it checks the wiring that test relies on.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

const bad = []
const sitemap = fs.readFileSync('app/sitemap.ts', 'utf8')
for (const reader of ['listShopProducts', 'listMarketListings', 'listHousingListings', 'listClassifieds']) {
  if (!new RegExp(`walkCommercePages\\([^)]*\\b${reader}\\)`).test(sitemap)) bad.push(`app/sitemap.ts does not walk ${reader} a page at a time`)
}
const walkTest = 'app/sitemap-commerce-walk.test.ts'
const text = fs.existsSync(walkTest) ? fs.readFileSync(walkTest, 'utf8') : ''
for (const name of ['names every listing past the first 100 in all four sections', 'stamps a category with its newest article date']) {
  if (!text.includes(`it('${name}'`)) bad.push(`${walkTest} no longer holds the case "${name}"`)
}
if (/\b(?:it|describe)\.(?:skip|only|todo)\b/.test(text)) bad.push(`${walkTest} skips or narrows a case`)
if (bad.length) { console.error('SCAN-1262 FAIL:\n  ' + bad.join('\n  ')); process.exit(1) }

const run = spawnSync('pnpm', ['-s', 'vitest', 'run', walkTest], { stdio: 'inherit' })
if (run.status !== 0) { console.error('SCAN-1262 FAIL: the commerce walk tests fail'); process.exit(1) }
console.log('SCAN-1262 ok: all four commerce sections are walked past the first 100 rows and help categories carry a lastmod')
