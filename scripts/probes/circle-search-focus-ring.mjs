// SCAN-1192: the members Circle search field shows a focus ring on its wrapper (its input has outline:0).
import { readFileSync } from 'node:fs'
const css = readFileSync('app/themes/frequency/members-circle.css', 'utf8')
if (!/\.fqc-search:focus-within\s*\{[^}]*outline:\s*2px solid/.test(css)) { console.error('FAIL: .fqc-search has no focus-within ring'); process.exit(1) }
console.log('ok')
