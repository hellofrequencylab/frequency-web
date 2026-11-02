// SEC-020: a follow-up that goes quiet must raise an alarm. Passes once a cron or check names it.
import { existsSync, readFileSync } from 'node:fs'
const f = 'lib/observability/slos.ts'
const s = existsSync(f) ? readFileSync(f, 'utf8') : ''
if (!/followUpSilence|FOLLOW_UP_SILENCE/.test(s)) { console.error('no follow-up silence alarm in slos.ts'); process.exit(1) }
