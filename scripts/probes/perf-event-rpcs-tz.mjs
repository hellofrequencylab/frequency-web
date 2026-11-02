// PERF-003 probe: no event RPC definition may read pg_timezone_names per call. Reads the migration tree:
// the LATEST migration that mentions each function decides, so a later re-create that brings the scan back fails this.
import { readdirSync, readFileSync } from 'node:fs'
const dir = 'supabase/migrations'
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
const snapshot = files.find((f) => f.includes('event_rpcs_stop_scanning_timezone_names'))
if (!snapshot) { console.error('FAIL: no migration moves the event RPCs off pg_timezone_names'); process.exit(1) }
const after = files.filter((f) => f > snapshot)
for (const f of after) {
  const s = readFileSync(`${dir}/${f}`, 'utf8')
  if (/create (or replace )?function public\.(public_events|public_calendar_feed|density_by_city|event_calendar_feed|public_organizer_events|space_public_calendar_feed)/i.test(s) && /pg_timezone_names/.test(s)) {
    console.error(`FAIL: ${f} re-creates an event RPC with a per-call pg_timezone_names scan`); process.exit(1)
  }
}
console.log('ok: event RPCs read private.tz_names()')
