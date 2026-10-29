#!/usr/bin/env node
// LIVE-1791: the Theme Kit pages share one layout, the Network page's, with only content, colours and pictures differing.
// A parity test renders the Network and Designer pages and compares sections and structural classes. Fails on main (no
// test, and Designer's preview chips and email slot differed from Network's).
import { existsSync, readFileSync } from 'node:fs'

const bad = []
const t = 'test/theme-pages-share-one-layout.render.test.tsx'
if (!existsSync(t)) bad.push(`missing ${t}`)
const data = readFileSync('lib/themes/designer-feature-data.ts', 'utf8')
if (!data.includes("qual: 'Link Page'") || !data.includes("label: 'Email template'")) bad.push("Designer's surface chips do not match Network's")
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('theme-pages-one-layout: ok')
