// ── Shared utility functions ──────────────────────────────────────────────────

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

/** Short date line, e.g. "Fri, Jun 24". */
export function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/** Full date + time, e.g. "Friday, June 24, 2026 at 3:00 PM". */
export function formatEventDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Calendar-chip parts: uppercase month + day-of-month, e.g. { month: "JUN", day: 24 }. */
export function eventDateBadge(iso: string): { month: string; day: number } {
  const d = new Date(iso)
  return {
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day: d.getDate(),
  }
}
