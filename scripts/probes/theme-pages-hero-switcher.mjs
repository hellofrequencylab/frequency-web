#!/usr/bin/env node
// LIVE-1881: the hero preview on every Theme Kit page switches between Website, Spotlight, Space and Email.
// Fails on main (Network and Designer show one fixed browser picture; Nocturne's hero has no switcher).
import { readFileSync } from 'node:fs'

const dir = 'components/frequency/site/pages/themes/'
const bad = []
const net = readFileSync(`${dir}frequency-network.tsx`, 'utf8')
const des = readFileSync(`${dir}frequency-designer.tsx`, 'utf8')
const noc = readFileSync(`${dir}frequency-midnight.tsx`, 'utf8')
if (!/nf-hero-shot">\s*<NetworkStage priority/.test(net)) bad.push('Network hero has no NetworkStage')
if (!/df-hero-shot">\s*<DesignerStage priority/.test(des)) bad.push('Designer hero has no DesignerStage')
if (!noc.includes('nf-hero-pv')) bad.push('Nocturne hero has no surface switcher')
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('theme-pages-hero-switcher: ok')
