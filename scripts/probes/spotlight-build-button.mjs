// Fails on main: the rail's "Build your page" button is a Link to the page you are already on.
import { readFileSync } from 'node:fs'
const s = readFileSync('components/admin/modules/personal-spotlight-module.tsx', 'utf8')
const l = readFileSync('components/admin/modules/personal-layout-module.tsx', 'utf8')
const ok = s.includes('jumpToBuilder') && s.includes("'member-layout-builder'") && l.includes('MEMBER_LAYOUT_BUILDER_ID')
if (!ok) { console.error('Build your page does nothing on your own profile'); process.exit(1) }
console.log('ok')
