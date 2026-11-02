// SCAN-1197: two oversized site images are resized in place (same path, same aspect), so nothing that references them breaks.
import { statSync } from 'node:fs'
const caps = { 'public/sites/alli-rae/bath-hero.webp': 600_000, 'public/sites/house-of-fates/path-logo.jpg': 250_000 }
const bad = Object.entries(caps).filter(([f, max]) => statSync(f).size > max).map(([f]) => f)
if (bad.length) { console.error('FAIL: still oversized:', bad.join(', ')); process.exit(1) }
console.log('ok')
