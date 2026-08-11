// ── Shared utility functions ──────────────────────────────────────────────────

/** Join truthy class names — a tiny dependency-free classnames helper. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

/**
 * Returns initials from a display name (up to 2 characters).
 * e.g. "Daniel Tyack" → "DT", "Madonna" → "M"
 */
export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

/**
 * ISO timestamp for `days` days before now. Kept as a plain helper (rather than
 * an inline `Date.now()` in a component body) so reads of the current clock stay
 * out of React's render path — see react-hooks/purity.
 */
export function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Returns a relative time string from an ISO datetime.
 * e.g. "just now", "3m ago", "2h ago", "4d ago"
 */
export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Converts a string to a URL-safe slug.
 * e.g. "San Diego North" → "san-diego-north"
 */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ── Event date formatting ─────────────────────────────────────────────────────
// Shared by the discover UI, the feed event cards, and the marketing event row,
// so an event date reads identically everywhere.
//
// 🔴 `timeZone: 'UTC'` IS LOAD-BEARING ON EVERY ONE OF THESE. It is not a default and it is not
// cosmetic. lib/time/zone.ts states the storage convention: an event's `starts_at` holds the
// wall-clock the host entered, kept as UTC PARTS (7:00 PM -> …T19:00:00Z), and "to render in the
// event's zone: show the stored UTC parts". Formatting without an explicit zone resolves in the
// RUNTIME's zone instead, which is invisible on the server (Vercel runs UTC) and wrong in every
// browser west of Greenwich.
//
// What that cost: a 6:00 AM Aug 15 event read "Thu, Aug 14" in the ⌘K overlay
// (components/search/search-overlay.tsx, a client component) and "Fri, Aug 15" on /search (a
// server component) and on the event page — three surfaces, one event, two dates. Any stored hour
// under the viewer's UTC offset flips the day. The comment above already claimed these read
// "identically everywhere"; that claim is what this fix makes true.
//
// components/events/event-calendar.tsx got this right and says why, which is the proof the
// convention was known — it just never reached the shared helper.

/** Short date line, e.g. "Fri, Jun 24". Rendered in UTC: see the note above. */
export function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** Full date + time, e.g. "Friday, June 24, 2026 at 3:00 PM". Rendered in UTC: see the note above. */
export function formatEventDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  })
}

/** Calendar-chip parts: uppercase month + day-of-month, e.g. { month: "JUN", day: 24 }. */
export function eventDateBadge(iso: string): { month: string; day: number } {
  const d = new Date(iso)
  return {
    month: d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase(),
    // getUTCDate(), not getDate(): the local-time getter was the other half of the same bug, and
    // it is the one that put a wrong NUMBER in the calendar chip rather than a wrong weekday.
    day: d.getUTCDate(),
  }
}
