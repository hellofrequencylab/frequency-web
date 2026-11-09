// SPEED-TIMER-OPEN-COUNT: opening the Mindless timer must not page through every member's practice log
// for the day on every open, and the day lookup must not sit in front of the other reads.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const src = readFileSync('lib/on-air/session-data.ts', 'utf8')
assert.ok(/function practicedTodayCached\(/.test(src), 'the member count is kept, not re-read on every open')
assert.ok(/PRACTICED_TODAY_TTL_MS/.test(src), 'the kept count expires')
assert.ok(/todayP\.then\(\(today\) => practicedTodayCached\(today\)/.test(src), 'the open path reads the count through the kept copy')
assert.ok(!/const today = await resolveMemberDay/.test(src), 'the day lookup runs beside the other reads')
const presence = readFileSync('lib/on-air/practice-presence.ts', 'utf8')
assert.ok(/throwOnError/.test(presence), 'a failed count read is never kept as zero')
console.log('ok: the timer open keeps the members-practiced-today count and does not serialise the day lookup')
