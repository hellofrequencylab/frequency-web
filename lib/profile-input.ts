// Server-side validation + sanitization for user-supplied profile fields.
// Shared by onboarding and settings so the caps/charset rules can't drift, and
// so the server never trusts client-side validation. Throws on invalid input.

const HANDLE_RE = /^[a-z0-9_]{3,30}$/
export const DISPLAY_NAME_MAX = 80
export const BIO_MAX = 500
/** The member's "home" label (neighborhood), capped where the settings form caps it. */
export const HOME_LABEL_MAX = 160

/** Strip control characters (a pasted zero-width or a NUL in a name) and trim. */
function cleanText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim()
}

/** One profile field as Vera (or any single-field path) may set it (SCAN-740): the same caps and
 *  the same required-name rule as sanitizeProfileInput, for one column at a time. */
export function sanitizeProfileFieldValue(
  column: 'display_name' | 'bio' | 'home_label',
  raw: unknown,
): { ok: true; value: string } | { ok: false; error: string } {
  const value = cleanText(String(raw ?? ''))
  if (column === 'display_name') {
    const v = value.slice(0, DISPLAY_NAME_MAX)
    if (!v) return { ok: false, error: 'Display name is required.' }
    return { ok: true, value: v }
  }
  if (column === 'bio') return { ok: true, value: value.slice(0, BIO_MAX) }
  return { ok: true, value: value.slice(0, HOME_LABEL_MAX) }
}

interface ProfileInput {
  displayName: string
  handle: string
  bio?: string
  avatarUrl?: string
}

interface SanitizedProfile {
  displayName: string
  handle: string
  bio: string
  avatarUrl: string
}

export function sanitizeProfileInput(input: ProfileInput): SanitizedProfile {
  const displayName = (input.displayName ?? '').trim().slice(0, DISPLAY_NAME_MAX)
  if (!displayName) throw new Error('Display name is required.')

  const handle = (input.handle ?? '').trim().toLowerCase()
  if (!HANDLE_RE.test(handle)) {
    throw new Error('Handle must be 3 to 30 characters: lowercase letters, numbers, or underscores.')
  }

  const bio = (input.bio ?? '').trim().slice(0, BIO_MAX)

  // Only accept an avatar URL that points at our own public Supabase storage;
  // anything else (arbitrary attacker-controlled URL stored verbatim) is dropped.
  let avatarUrl = (input.avatarUrl ?? '').trim()
  if (avatarUrl) {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    const allowed = base !== '' && avatarUrl.startsWith(`${base}/storage/v1/object/public/`)
    if (!allowed) avatarUrl = ''
  }

  return { displayName, handle, bio, avatarUrl }
}
