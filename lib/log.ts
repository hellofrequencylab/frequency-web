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

// ── briefError: make a thrown thing into ONE queryable line ───────────────────────────────
// Added 2026-08-25 after reading a real incident (LIVE-124). Between 02:18 and 02:53 UTC that
// morning Supabase was unreachable — Cloudflare 521, 522 and 525 against the project host — and
// the logs recorded it in the two worst ways available:
//
//   1. `String(err)` on a PostgrestError produced the literal string "[object Object]".
//      Two cron sites did this, so the ONE field that says what went wrong said nothing at all,
//      and the fields that would have said it (code, details, hint) were thrown away.
//
//   2. Elsewhere the raw `.message` was logged — and when the failure is an edge 5xx, that
//      message IS the entire Cloudflare HTML error page, roughly 15 KB of markup. Vercel groups
//      runtime errors BY MESSAGE, and every one of those pages carries a unique Ray ID and
//      timestamp, so every occurrence hashed to its own group. A single 35-minute outage came
//      back as ~20 separate error groups totalling 327 KB, with the actual diagnosis — "522:
//      Connection timed out" — buried in a <title> tag partway down each one.
//
// This module's own header says it exists to standardise the SHAPE so logs are queryable by
// field. A 15 KB message and an "[object Object]" both defeat that, from opposite directions.
//
// So: prefer a real message, never stringify an object into nothing, replace an HTML error page
// with the one line of it that carries the diagnosis, and bound the length. The result is that
// an outage groups as an outage.
const HTML_DOC = /^\s*<(?:!doctype|html)\b/i
const HTML_TITLE = /<title[^>]*>([^<]*)<\/title>/i

export function briefError(e: unknown, max = 300): string {
  let raw: string

  if (typeof e === 'string') raw = e
  else if (e && typeof e === 'object') {
    // Error, PostgrestError and friends all carry `message`. Reach for it BEFORE String(),
    // which is what turned a PostgrestError into "[object Object]".
    const msg = (e as { message?: unknown }).message
    if (typeof msg === 'string' && msg) raw = msg
    else {
      // No message: keep the fields rather than destroying them. JSON.stringify can throw on a
      // circular object, so String() stays as the last resort it was always meant to be.
      try {
        raw = JSON.stringify(e)
      } catch {
        raw = String(e)
      }
      if (raw === '{}' || raw === undefined) raw = String(e)
    }
  } else raw = String(e)

  // An upstream HTML error page: the <title> is the diagnosis ("supabase.co | 522: Connection
  // timed out"). Everything else is boilerplate that differs per request and so splits one
  // incident across many groups.
  if (HTML_DOC.test(raw)) {
    const title = raw.match(HTML_TITLE)?.[1]?.trim()
    raw = title ? `upstream returned an HTML error page: ${title}` : 'upstream returned an HTML error page'
  }

  raw = raw.replace(/\s+/g, ' ').trim()
  if (raw.length <= max) return raw
  // Say how much was dropped, so a truncated line is never mistaken for the whole message.
  return `${raw.slice(0, max)}… (+${raw.length - max} chars)`
}

export const log = {
  info:  (event: string, fields?: Fields) => emit('info', event, fields),
  warn:  (event: string, fields?: Fields) => emit('warn', event, fields),
  error: (event: string, fields?: Fields) => emit('error', event, fields),
  time,
}
