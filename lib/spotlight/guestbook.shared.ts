// Spotlight Guestbook — the CLIENT-SAFE half (types + pure rules, no IO/React/server-only),
// so the widget, the form island, and the server action all import the SAME shape and limits
// without dragging the admin client into a client bundle. Mirrors top-friends.types.ts.
// The IO lives in ./guestbook.ts (server-only); the write path is the session client in
// app/spotlight/[handle]/guestbook-actions.ts.

/** One rendered guestbook entry. Signer identity is resolved SERVER-SIDE from the signer's
 *  own public profile fields at read time (lib/spotlight/guestbook.ts) — never stored with
 *  the note — so a name/avatar can't be faked or go stale. */
export interface GuestbookEntry {
  id: string
  signerProfileId: string
  signerHandle: string
  signerDisplayName: string | null
  signerAvatarUrl: string | null
  message: string
  createdAt: string
}

/** The note's length bounds. The schema backstops the same range
 *  (spotlight_guestbook_message_len, 1..500). */
export const GUESTBOOK_MESSAGE_MAX = 500
export const GUESTBOOK_MESSAGE_MIN = 2

/** How many entries the page renders (newest first). */
export const GUESTBOOK_ENTRIES_SHOWN = 30

/** Rate limit: the most guestbooks one member can sign per hour, enforced in the sign
 *  action by counting the signer's own recent rows (their session can read them — the
 *  signer arm of the select policy). */
export const GUESTBOOK_SIGNS_PER_HOUR = 8

/**
 * Normalize a raw note before write. Pure and strict-but-forgiving: strips control
 * characters, tab -> space, CRLF -> LF, collapses newline runs to one and space runs to
 * one, trims, and clamps to GUESTBOOK_MESSAGE_MAX. Returns null when what is left is too
 * short to be a note — the action turns that into friendly copy, and the schema bound
 * (1..500) backstops anything that slips past.
 */
export function normalizeGuestbookMessage(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const cleaned = raw
    // Control characters except \t \n \r (handled next); includes DEL + the C1 range.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '')
    .replace(/\t/g, ' ')
    .replace(/\r\n?/g, '\n')
    // A run of newlines (with any surrounding spaces) becomes ONE newline.
    .replace(/ *\n[\n ]*/g, '\n')
    .replace(/ {2,}/g, ' ')
    .trim()
  if (cleaned.length < GUESTBOOK_MESSAGE_MIN) return null
  return cleaned.slice(0, GUESTBOOK_MESSAGE_MAX)
}
