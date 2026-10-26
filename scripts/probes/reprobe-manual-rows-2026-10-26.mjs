// Real regression guards for rows that were closed on manual probes (2026-10-26 meta scan).
// Usage: node scripts/probes/reprobe-manual-rows-2026-10-26.mjs <key>
// Each key reads the source the row's browser check exercised and fails when the repair is undone.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(tsx?|mjs)$/.test(e.name)) out.push(p)
  }
  return out
}

const checks = {
  // SCAN-1033: the timer orb paints from the design token, and both designs define it.
  'orb-token': () =>
    /var\(--design-practice-orb\)/.test(read('components/on-air/compact-setup.tsx')) &&
    /--design-practice-orb:/.test(read('app/globals.css')) &&
    /--design-practice-orb:/.test(read('app/themes/frequency.css')),
  // SCAN-1034: the Frequency wordmark takes the strong accent roles, not the plain ones.
  'wordmark-role': () => {
    const src = read('components/on-air/mode-toggle.tsx')
    return /text-move-strong/.test(src) && /text-primary-strong/.test(src)
  },
  // SCAN-1040: the Around You tab panel is labelled by its tab.
  'tabpanel-labelled': () => /role="tabpanel"\s+aria-labelledby=/.test(read('components/frequency/members/events/around-you-live.tsx')),
  // SCAN-1044: niche example-screen captions read a semantic ink token, never a literal colour.
  'niche-caption-token': () => {
    const css = read('app/themes/frequency/site-niche.css')
    return (
      /--fq-nk-screen-caption:var\(--fq-ink-3\)/.test(css) &&
      /\.nk-scr \.k\{[^}]*color:var\(--fq-nk-screen-caption\)/.test(css)
    )
  },
  // HYG-178: the superseded map colour helper stays removed.
  'map-color-gone': () => !['app', 'components', 'lib', 'scripts'].flatMap((d) => walk(d)).some((f) => f !== import.meta.filename && /\bmapColor\b/.test(read(f))),
}

const key = process.argv[2]
if (!checks[key]) {
  console.error(`unknown key "${key}"; keys: ${Object.keys(checks).join(', ')}`)
  process.exit(2)
}
const ok = checks[key]()
console.log(`${key}: ${ok ? 'holds' : 'REGRESSED'}`)
process.exit(ok ? 0 : 1)
