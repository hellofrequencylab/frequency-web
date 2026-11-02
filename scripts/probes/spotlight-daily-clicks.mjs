// Fails on main: the editor shows a click total but no per-day view.
import { readFileSync } from 'node:fs'
const l = readFileSync('lib/spotlight/link-clicks.ts', 'utf8')
const e = readFileSync('components/spotlight/spotlight-page-editor.tsx', 'utf8')
if (!l.includes('foldLinkClicks') || !l.includes('daily')) { console.error('no per-day totals'); process.exit(1) }
if (!e.includes('Clicks per day')) { console.error('the editor draws no per-day chart'); process.exit(1) }
console.log('ok')
