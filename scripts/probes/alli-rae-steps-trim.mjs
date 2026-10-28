#!/usr/bin/env node
// LIVE-1560: the Home "How We Bring Your Vision To Life" section is trimmed so the panel stands about as tall as the
// portrait: each step keeps its title, a short lead and a tight body; the Designer CSS stretches the portrait to the
// column on desktop; update 4 carries the copy to the live Space.
import { readFileSync, existsSync } from 'node:fs'

const r = (f) => readFileSync(f, 'utf8')
const bad = []
const site = r('lib/sites/alli-rae-site.ts')
const block = site.split("b('DesignerSteps'")[1]?.split("b('DesignerServices'")[0] ?? ''
if (!block) bad.push('the Home steps block is missing')
const bodies = [...block.matchAll(/body: '([^']*)'/g)].map((m) => m[1])
if (bodies.length !== 3) bad.push(`expected 3 step bodies, found ${bodies.length}`)
for (const b of bodies) if (b.length > 170) bad.push(`a step body is ${b.length} characters (limit 170): ${b.slice(0, 40)}...`)
for (const t of ['Design-First Thinking', 'Builder-Level Execution', 'Start-to-Finish Support']) if (!block.includes(t)) bad.push(`step title ${t} is gone`)
const css = r('components/sites/designer-blocks-css.ts')
if (!/data-dz="steps"\] \.dz-split\{align-items:stretch\}/.test(css)) bad.push('the steps portrait does not stretch to the panel column')
const seed = existsSync('scripts/seed-alli-rae-update-4.mts') ? r('scripts/seed-alli-rae-update-4.mts') : ''
for (const n of ['rev not in (3, 4)', 'zz_backup_alli_rae_update4_20261028', 'save_website_editor', '-- ROLLBACK']) if (!seed.includes(n)) bad.push(`scripts/seed-alli-rae-update-4.mts lacks ${n}`)
if (bad.length) {
  console.error(bad.map((b) => `✗ ${b}`).join('\n'))
  process.exit(1)
}
console.log('Alli Rae steps are trimmed and fitted.')
