// SCAN-1272: a public event hosted by a Space names that Space as its host and its Event organizer.
import { readFileSync } from 'node:fs'

const discovery = readFileSync('lib/spaces/discovery.ts', 'utf8')
const data = readFileSync('app/discover/events/_data.ts', 'utf8')
const jsonld = readFileSync('lib/jsonld.ts', 'utf8')
const page = readFileSync('app/(public)/events/[slug]/page.tsx', 'utf8')
const bad = []
if (!/export async function getEventHostSpace\(/.test(discovery)) bad.push('there is no reader for an event\'s host Space')
if (!/getEventHostSpace\(r\.id\)/.test(data)) bad.push('the event enrichment does not read the host Space')
if (!/event\.host_space[\s\S]{0,200}abs\(`\/spaces\/\$\{event\.host_space\.slug\}`\)/.test(jsonld))
  bad.push('the Event schema has no Space organizer fallback')
if (!/enrichment\?\.host_space/.test(page)) bad.push('the event page shows no host Space link')
if (bad.length) {
  console.error('SCAN-1272: ' + bad.join('; '))
  process.exit(1)
}
console.log('SCAN-1272: a Space-hosted public event names the Space as host and organizer')
