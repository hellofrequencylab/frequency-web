#!/usr/bin/env node
// LIVE-1507: the Alli Rae header spans the viewport, the menu is Home | Portfolio | About with no houses in it, the
// Portfolio page lists the custom builds, and update 3 carries the entitlement a saved menu needs to draw.
import { readFileSync, existsSync } from 'node:fs'

const r = (f) => readFileSync(f, 'utf8')
const bad = []
const css = r('components/sites/designer-css.ts')
const rule = (sel) => css.split('\n').find((l) => l.includes(sel)) ?? ''
for (const sel of ['.dz-util{display:flex', '.dz-top .hs-pill{']) {
  const l = rule(sel)
  if (!l) bad.push(`designer-css.ts lost the ${sel} rule`)
  else if (/max-width:var\(--dz-container\)/.test(l) || /margin:0 auto/.test(l)) bad.push(`designer-css.ts still insets ${sel} to the container`)
}
const site = r('lib/sites/alli-rae-site.ts')
const nav = site.split('export const ALLI_RAE_NAV')[1]?.split('/** The published website state')[0] ?? ''
if (!nav) bad.push('alli-rae-site.ts has no ALLI_RAE_NAV')
else {
  const labels = [...nav.matchAll(/label: '([^']+)'/g)].map((m) => m[1])
  if (labels.join('|') !== 'Home|Portfolio|About') bad.push(`ALLI_RAE_NAV reads ${labels.join('|')}, not Home|Portfolio|About`)
  if (nav.includes('children')) bad.push('ALLI_RAE_NAV has a dropdown')
}
if (!/b\('DesignerPortfolio', \{ eyebrow: 'Custom Builds'/.test(site)) bad.push('the Portfolio page does not head the custom builds')
const seed = existsSync('scripts/seed-alli-rae-update-3.mts') ? r('scripts/seed-alli-rae-update-3.mts') : ''
for (const n of ['ALLI_RAE_NAV', 'rev not in (2, 3)', 'zz_backup_alli_rae_update3_20261027', 'space_full_website', 'save_website_editor', '-- ROLLBACK']) {
  if (!seed.includes(n)) bad.push(`scripts/seed-alli-rae-update-3.mts lacks ${n}`)
}
if (bad.length) {
  console.error(bad.map((b) => `✗ ${b}`).join('\n'))
  process.exit(1)
}
console.log('Alli Rae header and menu are in place.')
