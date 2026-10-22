// LIVE-1275: Help and Support are reachable from every menu system.
import fs from 'node:fs'
const r = (f) => fs.readFileSync(f, 'utf8')
const bad = []
if (!/DIRECT_LINKS[\s\S]*?label: 'Help'[\s\S]*?\n\]/.test(r('lib/frequency/site-nav.ts'))) bad.push('public header has no Help link')
if (!r('components/frequency/admin/space-console.tsx').includes("key: 'support'")) bad.push('Space console has no support link')
if (!r('components/frequency/admin/admin-console.tsx').includes("key: 'support'")) bad.push('platform admin has no support link')
if (!r('components/frequency/members/shell/nav.ts').includes("label: 'Help & support'")) bad.push('avatar menu has no Help & support')
if (bad.length) { console.error('LIVE-1275: ' + bad.join('; ')); process.exit(1) }
