// SCAN-1273: crawlers stay out of the /events and /discover/spaces filter combinations.
import { readFileSync } from 'node:fs'

const src = readFileSync('app/robots.ts', 'utf8')
const bad = []
for (const rule of ['"/events?"', '"/discover/spaces?"']) if (!src.includes(rule)) bad.push(`robots does not disallow ${rule}`)
// The plain pages must stay crawlable: a bare "/events" or "/discover/spaces" rule would hide them.
for (const rule of ['"/events"', '"/discover/spaces"', '"/events/"', '"/discover/"']) if (src.includes(rule)) bad.push(`robots disallows ${rule}, which hides the page itself`)
if (bad.length) {
  console.error('SCAN-1273: ' + bad.join('; '))
  process.exit(1)
}
console.log('SCAN-1273: filter combinations on /events and /discover/spaces are disallowed, the pages are not')
