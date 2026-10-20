#!/usr/bin/env node
// FIXTURE RENDER, step 1: compile the app's real CSS (app/globals.css through Tailwind v4, then every
// Frequency sheet) into one file a bare HTML page can load. Usage: node scripts/render/build-css.mjs <out.css>
// Production loads a theme sheet only where its stub imports it; here ALL Frequency sheets are inlined,
// so a rule from another route's sheet can show that a cold load would not.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import tailwind from '@tailwindcss/postcss'

// postcss is a dependency of @tailwindcss/postcss, not of the app, so pnpm only exposes it from there.
const postcss = createRequire(createRequire(import.meta.url).resolve('@tailwindcss/postcss'))('postcss')

const out = process.argv[2]
if (!out) {
  console.error('usage: node scripts/render/build-css.mjs <out.css>')
  process.exit(2)
}
const globals = readFileSync('app/globals.css', 'utf8')
const compiled = await postcss([tailwind()]).process(globals, { from: join(process.cwd(), 'app/globals.css') })
const themes = ['app/themes/frequency/core.css', 'app/themes/frequency.css']
for (const f of readdirSync('app/themes/frequency').sort()) {
  const p = join('app/themes/frequency', f)
  if (f.endsWith('.css') && !themes.includes(p)) themes.push(p)
}
const sheets = themes.flatMap((p) => {
  try {
    return [readFileSync(p, 'utf8')]
  } catch {
    return []
  }
})
writeFileSync(out, [compiled.css, ...sheets].join('\n'))
console.log(`wrote ${out}: ${(compiled.css.length / 1024) | 0} KB compiled + ${sheets.length} theme sheets`)
