#!/usr/bin/env node
// LIVE-2370 probe: the four-parts guard exists, walks every offered theme, and checks all four parts.
import { readFileSync } from 'node:fs'
const src = readFileSync(new URL('../../../lib/themes/four-parts.test.ts', import.meta.url), 'utf8')
const fail = (m) => { console.error(`LIVE-2370: ${m}`); process.exit(1) }
if (!/const offered = SITE_THEMES\.map\(\(t\) => t\.id\)/.test(src)) fail('the guard does not walk every offered theme')
for (const [part, re] of [['Space', /MEGA_SURFACES\[t\]/], ['Spotlight', /spaceLooksFor\(t\)/], ['Website', /loadKit\(`\$\{t\}-general`\)/], ['Email', /SAMPLE_SPECS/]]) {
  if (!re.test(src)) fail(`the guard does not check the ${part} part`)
}
console.log('LIVE-2370: every offered theme is held to Space, Spotlight, Website and Email')
