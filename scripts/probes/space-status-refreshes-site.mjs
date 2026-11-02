// SEC-017: suspending or archiving a Space expires its cached website (refreshSite), so a takedown is immediate.
import { readFileSync } from 'node:fs'
const src = readFileSync('app/(main)/admin/spaces/[id]/lifecycle-actions.ts', 'utf8')
const fn = src.slice(src.indexOf('export async function setSpaceStatus'), src.indexOf('export async function transferSpaceOwnership'))
const bad = []
if (!/from '@\/lib\/sites\/site-cache'/.test(src)) bad.push('refreshSite not imported')
if (!/refreshSite\(/.test(fn)) bad.push('setSpaceStatus does not call refreshSite')
if (bad.length) { console.error('FAIL', bad); process.exit(1) }
console.log('ok: space status change refreshes the site cache')
