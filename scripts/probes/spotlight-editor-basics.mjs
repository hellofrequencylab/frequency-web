// Fails on main: the Spotlight editor loses unsaved edits silently, has no copy-link button and no click total.
import { readFileSync } from 'node:fs'
const e = readFileSync('components/spotlight/spotlight-page-editor.tsx', 'utf8')
if (!e.includes("'beforeunload'")) { console.error('no unsaved-changes guard'); process.exit(1) }
if (!e.includes('Copy link')) { console.error('no copy-link button'); process.exit(1) }
if (!e.includes('totalClicks')) { console.error('no click total'); process.exit(1) }
console.log('ok')
