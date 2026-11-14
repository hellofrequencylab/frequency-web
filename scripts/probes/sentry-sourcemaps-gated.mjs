// HYG-232: source maps pushed the production compile over the 8 GB build machine, so next.config.ts must gate them behind
// the SENTRY_SOURCEMAPS switch (envFlag), .env.example must list it blank, and RUNBOOKS must hold its activation gate.
// Exits 1 when any of those is missing.
import { readFileSync } from 'node:fs'
const code = readFileSync('next.config.ts', 'utf8').replace(/^\s*\/\/.*$/gm, '')
const checks = [
  ['the switch reads envFlag, not a hand-rolled compare', /envFlag\('SENTRY_SOURCEMAPS'\)/.test(code) && !/SENTRY_SOURCEMAPS\s*===/.test(code)],
  ['sourcemaps.disable follows the switch', /disable:\s*!uploadSourceMaps/.test(code)],
  ['.env.example lists it blank', /^SENTRY_SOURCEMAPS=$/m.test(readFileSync('.env.example', 'utf8'))],
  ['RUNBOOKS holds the activation gate', /SENTRY_SOURCEMAPS[\s\S]{0,900}Activation gate/.test(readFileSync('docs/RUNBOOKS.md', 'utf8'))],
]
let bad = 0
for (const [l, ok] of checks) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}`); if (!ok) bad++ }
process.exit(bad ? 1 : 0)
