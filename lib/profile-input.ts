// Server-side validation + sanitization for user-supplied profile fields.
// Shared by onboarding and settings so the caps/charset rules can't drift, and
// so the server never trusts client-side validation. Throws on invalid input.

const HANDLE_RE = /^[a-z0-9_]{3,30}$/
const DISPLAY_NAME_MAX = 80
const BIO_MAX = 500

export interface ProfileInput {
  displayName: string
  handle: string
  bio?: string
  avatarUrl?: string
}

export interface SanitizedProfile {
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
