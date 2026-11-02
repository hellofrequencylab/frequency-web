// SEC-020: both drip crons report a stalled pass (due work, nothing delivered).
import { readFileSync } from 'node:fs'
const bad = []
for (const f of ['app/api/cron/space-drips/route.ts', 'app/api/cron/journey-drips/route.ts']) {
  if (!readFileSync(f, 'utf8').includes('reportFollowUp(')) bad.push(f)
}
if (bad.length) { console.error('no follow-up stall report in: ' + bad.join(', ')); process.exit(1) }
