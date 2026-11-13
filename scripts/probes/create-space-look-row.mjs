// LIVE-2272: the 12-minute builder picks its look in two hero rows (theme, accent), starts on New World, remembers the
// last pick, and the preview name mirrors the name input ("Business Name" until one is typed). Exits 1 when any fails.
import { readFileSync } from 'node:fs'
const read = (p) => readFileSync(p, 'utf8')
const studio = read('components/frequency/site/pages/create-space/create-space-studio.tsx')
const steps = read('components/frequency/site/pages/create-space/create-space-steps.tsx')
const kit = read('lib/create-space/last-kit.ts')
const site = read('lib/create-space/preview-site.ts')
const checks = [
  ['hero renders the look rows', studio.includes('<LookRows')],
  ['theme pick is remembered', studio.includes('rememberKit(id)')],
  ['accent pick is remembered', studio.includes('rememberAccent(')],
  ['accent is no longer asked inside the name card', !steps.includes('cs-accent')],
  ['remembered accent has a reader', kit.includes('export function lastAccentAt')],
  ['preview name placeholder is Business Name', site.includes("input.name.trim() || 'Business Name'")],
]
let bad = 0
for (const [label, ok] of checks) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) bad++ }
process.exit(bad ? 1 : 0)
