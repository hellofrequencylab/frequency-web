import fs from 'node:fs'
const r = f => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '')
const page = r('app/(main)/spaces/[slug]/network/page.tsx'), cards = r('components/network/network-cards.tsx'), entity = r('components/cards/entity-card.tsx')
const bad = []
if (!page.includes('ChapterCard') || !page.includes('NetworkEventCard')) bad.push('the Network page does not use the chapter and event cards')
if (!cards.includes('coverOverlay') || !cards.includes('wrapTitle')) bad.push('the cards lost their header pills or wrapping title')
if (!entity.includes('wrapTitle')) bad.push('EntityCard cannot wrap a title')
if (bad.length) { console.error('LIVE-1230: ' + bad.join('; ')); process.exit(1) }
