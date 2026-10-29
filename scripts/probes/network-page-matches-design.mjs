// The /themes/network page keeps the section order of the Network design system's Theme Feature Page
// (01 Hero, 03 Today, 04 Theme preview, 05 Inside the kit, 06 Make it yours, 07 Thirteen kits, 08 What carries over,
// 09 Built right, 10 Questions, 11 Setup, 12 Start). Fails while the older sections are still there.
import { readFileSync } from 'node:fs'

const src = readFileSync('components/frequency/site/pages/themes/frequency-network.tsx', 'utf8')
const want = ['05 Inside the kit', '07 Thirteen kits', '09 Built right', '11 Setup', '12 Start']
const missing = want.filter((l) => !src.includes(`data-screen-label="${l}"`))
const stale = ['Four places', 'Spotlight layouts', '08 Tools'].filter((l) => src.includes(`data-screen-label="`) && src.includes(l) && /data-screen-label="\d+ (Four places|Spotlight layouts|Tools)"/.test(src))
if (missing.length || stale.length) {
  console.error(`Network page differs from the design page. Missing: ${missing.join(', ') || 'none'}. Stale: ${stale.join(', ') || 'none'}`)
  process.exit(1)
}
console.log('ok: Network page sections follow the design page')
