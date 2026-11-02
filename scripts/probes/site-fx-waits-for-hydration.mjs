#!/usr/bin/env node
// LIVE-1972: the site FX island must not decorate server HTML React has not hydrated yet.
// Measured 2026-11-02 in a real browser on /pricing, /themes, /for, /help, /discover (about 25 routes):
// "Hydration failed ... tx-field" because SiteFx ran on mount, before a Suspense-wrapped page hydrated.
// This probe reads the shipped code: the effect must not call run() unguarded.
import { readFileSync } from 'node:fs'
const src = readFileSync('components/frequency/site/shell/site-fx.tsx', 'utf8')
const eff = src.slice(src.indexOf('export function SiteFx'))
const bad = []
if (!/__reactFiber\$/.test(src)) bad.push('SiteFx never checks that React hydrated the nodes it decorates')
if (!/MAX_WAIT_MS/.test(src)) bad.push('the hydration wait has no time limit, so FX could be missing for good')
if (/useEffect\(\(\) => \{[\s\S]*?let stop = run\(root\)/.test(eff)) bad.push('the effect decorates on mount, before hydration')
if (bad.length) {
  console.error(bad.join('; '))
  process.exit(1)
}
console.log('site FX waits for hydration, with a time limit')
