#!/usr/bin/env node
// PERF-007: after PERF-006 the /events map lightbox reads its rows when it opens, and on production the first
// open waited about 3 s on that read (2026-11-17). Checks that a map door warms the read on intent: the tile
// and the Map button fire the warm event on pointer, focus and touch, and the lightbox reads when warmed.
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../../components/frequency/members/events/events-map-lightbox.tsx', import.meta.url), 'utf8')
const fails = []
if (!/onPointerEnter: warmEventsMap, onFocus: warmEventsMap, onTouchStart: warmEventsMap/.test(src)) fails.push('the map doors do not warm the read on pointer, focus and touch')
if ((src.match(/aria-haspopup="dialog" \{\.\.\.warmProps\}/g) || []).length < 2) fails.push('the tile and the Map button do not both carry the warm handlers')
if (!/needRows = \(open \|\| warm\)/.test(src)) fails.push('the lightbox reads only on open, not when warmed')

if (fails.length) {
  console.error(`PERF-007 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('PERF-007 ok: a map door starts the lightbox read on intent, so the rows are in by the tap')
