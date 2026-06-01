// Minimal structured logger for server-side code (cron jobs, route handlers).
//
// Emits one JSON object per line. console.* is the transport Vercel actually
// captures and ships to its log drains, so we don't add a dependency — we only
// standardise the *shape* so logs are queryable by field (event, level, plus
// whatever structured fields the caller passes) instead of being free-text
// strings that have to be regex-scraped.
//
// Usage:
//   log.info('cron.weekly_digest', { candidates, sent, skipped })
//   log.error('cron.lifecycle_triggers.fetch_failed', { error: err.message })
//
// Convention: `event` is a dot-namespaced identifier (`<area>.<thing>[.<outcome>]`),
// stable across runs so you can filter/aggregate on it. Put the run's numbers
// in `fields`, never interpolated into the event name.

type Level = 'info' | 'warn' | 'error'
type Fields = Record<string, unknown>

function emit(level: Level, event: string, fields?: Fields) {
  const line = JSON.stringify({ level, event, ts: new Date().toISOString(), ...fields })
  // Route by level so errors/warnings land on stderr where collectors expect them.
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const log = {
  info:  (event: string, fields?: Fields) => emit('info', event, fields),
  warn:  (event: string, fields?: Fields) => emit('warn', event, fields),
  error: (event: string, fields?: Fields) => emit('error', event, fields),
}
