#!/usr/bin/env node
// LIVE-962 (ADR-1792): the violet and indigo family is gone from the platform's own surfaces.
//
// Scans app/, components/ and lib/ for any hex colour in the violet band (hue 235 to 300 degrees,
// saturation over .25, lightness .06 to .92) and for the retired token names. Allowed: the handoff
// pastel pill gradient lines (--fq-pa, --fq-pa-soft, --pa), its orb stop #E6CDF4, and the three
// brand or member-chosen palettes that are not the platform's accent (Wildheart, the Spotlight
// presets and the Wildheart theme contract) and DAWN's own files.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// DAWN's own tokens (app/globals.css :root and its two TypeScript mirrors) belong to the DAWN design that
// Space websites wear; Frequency overrides them in app/themes/frequency.css. lib/theme/cyberunicorn.ts is
// the CyberUnicorn 5000 device skin (its synthwave sky is the firmware's own colour), worn by one panel only.
const SKIP = new Set(['lib/theme/wildheart.ts', 'lib/theme/cyberunicorn.ts', 'lib/spotlight/theme.ts', 'app/globals.css', 'lib/maps/pin-kinds.ts', 'app/dev/og-root-card/route.tsx'])
// A stock website theme's own palette may carry violet (ADR-1885: Midnight keeps its violet #A68BF2 as the
// theme's accent, and a Space accent overrides it). The exception is explicit and per hex, in the one file
// that holds theme palettes: any other violet in theme-contract.json fails like it does anywhere else.
const THEME_PALETTE_VIOLET = {
  'lib/sites/editor/theme-contract.json': new Set(['1C1424', '261C31', '654590', '6E4D96', 'C7ADE8', '1C1430', '7D5FD3', 'A68BF2', 'CDBDFB']),
}
const files = execSync('git ls-files app components lib').toString().split('\n').filter(Boolean)
const bad = []

function hsl(hex) {
  const n = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2
  if (mx === mn) return { h: 0, s: 0, l }
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: h * 60, s, l }
}

for (const f of files) {
  if (SKIP.has(f) || /\.test\.(ts|tsx)$/.test(f) || !/\.(css|ts|tsx|json|mjs)$/.test(f)) continue
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (/--fq-pa:|--fq-pa-soft:|--pa:|--fq-pa-orb:|--pa-orb:/.test(line)) return
    for (const m of line.matchAll(/#([0-9a-fA-F]{6})\b|#([0-9a-fA-F]{3})\b(?![0-9a-fA-F])/g)) {
      const hex = (m[1] || m[2]).toUpperCase()
      if (hex === 'E6CDF4' || THEME_PALETTE_VIOLET[f]?.has(hex)) continue
      const { h, s, l } = hsl(hex)
      if (h >= 235 && h <= 295 && s > 0.25 && l > 0.06 && l < 0.92) bad.push(`${f}:${i + 1} #${hex}`)
    }
    if (/--fq-x-violet|--fq-uv-violet|data-tone="violet"/.test(line)) bad.push(`${f}:${i + 1} retired violet token`)
  })
}
if (bad.length) {
  console.error('the violet family is back:\n  ' + bad.join('\n  '))
  process.exit(1)
}
console.log('violet-family: none in app, components or lib (pastel pill gradient and brand palettes excepted)')
