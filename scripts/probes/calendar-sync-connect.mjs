// LIVE-1179: at least one calendar sync provider can be connected, instead of every row being marked Coming soon.
import { readFileSync } from 'node:fs'

const sync = readFileSync('app/(main)/spaces/[slug]/settings/calendar/calendar-sync-soon.tsx', 'utf8')
if (sync.includes('ComingSoonMark')) {
  console.error('every calendar sync provider is still marked Coming soon')
  process.exit(1)
}
