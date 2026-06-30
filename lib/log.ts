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
//   const out = await log.time('cron.event_occurrences', () => generateAllOccurrences())
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

// A monotonic millisecond clock for measuring elapsed time. `performance.now()`
// is unaffected by wall-clock adjustments (NTP/DST) so durations never go negative
// or jump; we fall back to Date.now() only on a runtime without `performance`.
function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

/**
 * Time an async (or sync) operation and emit one structured timing line, then
 * return the operation's result. The log line carries `duration_ms` and an
 * `ok` boolean so a slow or failing step is queryable by the same `event`
 * vocabulary as the rest of the logger — e.g. filter `event="cron.refresh_traits"`
 * and chart p95 `duration_ms`, or alert on `ok=false`.
 *
 *   const result = await log.time('cron.event_occurrences', () => generateAllOccurrences())
 *
 * On success the line is emitted at `info`. If `fn` throws, a line is emitted at
 * `error` (with `ok:false` and the error message) and the error is RE-THROWN —
 * timing never swallows failures or changes control flow. Extra `fields` are
 * merged into the line so callers can attach run dimensions (counts, ids).
 */
async function time<T>(
  event: string,
  fn: () => T | Promise<T>,
  fields?: Fields,
): Promise<T> {
  const started = nowMs()
  try {
    const result = await fn()
    emit('info', event, { ...fields, ok: true, duration_ms: Math.round(nowMs() - started) })
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    emit('error', event, {
      ...fields,
      ok: false,
      duration_ms: Math.round(nowMs() - started),
      error: message,
    })
    throw err
  }
}

export const log = {
  info:  (event: string, fields?: Fields) => emit('info', event, fields),
  warn:  (event: string, fields?: Fields) => emit('warn', event, fields),
  error: (event: string, fields?: Fields) => emit('error', event, fields),
  time,
}
