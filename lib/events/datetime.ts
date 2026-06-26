// Event time convention — ONE place, so every create/edit/draft/settings path agrees.
//
// Event times are stored "UTC-naive": the host's `datetime-local` wall-clock is kept
// LITERALLY (7:00 PM → 19:00:00Z) and rendered back in UTC everywhere (the event page,
// reminders, the edit round-trip). The canonical round-trip already lives in
// app/(main)/events/[slug]/edit/page.tsx (toInput, UTC parts); these helpers make that
// convention explicit and reusable so the draft editor, the in-page Settings module, and
// the server actions stop disagreeing about what a stored timestamp means.
//
// Why not just `new Date(local).toISOString()`? That parses a tz-less string in the
// runtime's LOCAL zone — the browser's for client code, the server's for actions. It only
// looks right because prod Node is UTC; a NY browser (draft editor) or a non-UTC server
// silently shifts every event by the offset. Pinning ":00Z" removes the dependency.

// Strict shapes — validate BEFORE `new Date(...)`, because V8's lenient fallback parser
// turns garbage like "not-a-date" into a real date instead of NaN. We only accept the exact
// `datetime-local` / date-input formats.
const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** A host's `datetime-local` value (`YYYY-MM-DDTHH:mm`, optionally with seconds) → an ISO
 *  instant that keeps the wall-clock literally (treated as UTC). null on empty/malformed. */
export function wallClockToIso(local: string | null | undefined): string | null {
  if (!local || !LOCAL_DATETIME.test(local)) return null
  const withSeconds = /:\d{2}:\d{2}$/.test(local) ? local : `${local}:00`
  const d = new Date(`${withSeconds}Z`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** A date-only value (`YYYY-MM-DD`, e.g. a recurrence end) → midnight-UTC ISO, so a
 *  west-of-UTC server doesn't roll it back a day. null on empty/malformed. */
export function dateToWallClockIso(date: string | null | undefined): string | null {
  if (!date || !DATE_ONLY.test(date)) return null
  const d = new Date(`${date}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** A stored ISO instant → the `YYYY-MM-DDTHH:mm` a `<input type="datetime-local">` wants,
 *  reading UTC parts so the field shows the same wall-clock that was stored. '' when empty. */
export function isoToWallClockInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}
