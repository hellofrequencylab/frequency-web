#!/usr/bin/env node
// LIVE-1976: the "What carries to each surface" grid on every Theme Kit page has real rows (WCAG aria-required-children),
// and Nocturne's "off" cards no longer dim the text with opacity (colour contrast).
import { readFileSync } from 'node:fs'

const dir = 'components/frequency/site/pages/themes/'
const bad = []
for (const [file, pre] of [
  ['frequency-network.tsx', 'nf'],
  ['frequency-designer.tsx', 'df'],
  ['frequency-temple.tsx', 'tf'],
  ['frequency-midnight.tsx', 'nf'],
]) {
  const s = readFileSync(`${dir}${file}`, 'utf8')
  if (!s.includes(`<div className="${pre}-cmp-row" role="row">`)) bad.push(`${file}: header cells are not inside a row`)
  if (!s.includes(`${pre}-cmp-row" role="row" key=`)) bad.push(`${file}: body rows have no role="row"`)
  if (!s.includes('role="rowheader"')) bad.push(`${file}: no rowheader`)
}
if (/\.nf-ic\.off\{opacity/.test(readFileSync(`${dir}nocturne-feature.css`, 'utf8'))) bad.push('Nocturne off cards still dim with opacity')
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('theme-pages-comparison-rows: ok')
