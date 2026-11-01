// Fails on main: neither Spotlight builder has a clear button that opens the Spotlight.
import { readFileSync } from 'node:fs'
const a = readFileSync('components/spotlight/space-spotlight-editor.tsx', 'utf8')
const b = readFileSync('components/admin/modules/personal-spotlight-module.tsx', 'utf8')
if (!a.includes('View your Spotlight') || !b.includes('View your Spotlight')) { console.error('A Spotlight builder has no View your Spotlight button'); process.exit(1) }
console.log('ok')
