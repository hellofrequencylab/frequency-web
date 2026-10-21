import fs from 'node:fs'
const r = f => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '')
const page = r('app/(main)/spaces/[slug]/network/page.tsx'), css = r('app/themes/frequency/members-events.css')
const bad = []
if (!page.includes('eyebrow="Network"')) bad.push('the Network page lost its eyebrow')
if (!page.includes('Full calendar')) bad.push('Up next lost its Full calendar link')
if (!page.includes('data-network-cal') || !css.includes('[data-network-cal]')) bad.push('the shared calendar lost its chip styling hook')
if (bad.length) { console.error('LIVE-1231: ' + bad.join('; ')); process.exit(1) }
