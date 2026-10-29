// WHAT A VISITOR BRINGS TO THE LAUNCH (the pure half). A page that collects answers before the launch (today the
// signed-out builder on /create-a-space) writes them into the launch hold's Spotlight answers under these keys;
// the Spotlight step reads them back from here. One list of keys, so the writer and the reader cannot drift.
// PURE and client-safe: no imports from the app, so a probe can run it under node.
//
// The Spotlight form itself reads `name`, `line` and `link`. The keys below ride beside them in the same hold:
// the handle the visitor claimed, the Theme Kit they picked, their accent, and the host's name.

export interface LaunchCarry {
  /** A Space handle, lowercase letters and digits with single hyphens inside, 2 to 40 characters. */
  handle?: string
  /** A Theme Kit id (the Mega Theme the Space is dressed in once it exists). createSpace re-validates it. */
  theme?: string
  /** The accent's place in the kit's accent list. Kept for the Website step; nothing reads it yet. */
  accent?: string
  /** The host's name as the visitor typed it. */
  host?: string
}

const HANDLE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const THEME = /^[a-z0-9-]{1,40}$/

/** A carried handle, or null when it is missing or not a handle. Total. */
export function carriedHandle(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length >= 2 && raw.length <= 40 && HANDLE.test(raw) ? raw : null
}

/** What the hold's Spotlight answers carry beyond the form's own three fields. Total: anything off-shape is left out. */
export function readCarry(answers: Record<string, string> | undefined | null): LaunchCarry {
  const carry: LaunchCarry = {}
  const handle = carriedHandle(answers?.handle)
  if (handle) carry.handle = handle
  if (typeof answers?.theme === 'string' && THEME.test(answers.theme)) carry.theme = answers.theme
  if (typeof answers?.accent === 'string' && /^\d{1,2}$/.test(answers.accent)) carry.accent = answers.accent
  const host = typeof answers?.host === 'string' ? answers.host.replace(/\s+/g, ' ').trim().slice(0, 80) : ''
  if (host) carry.host = host
  return carry
}

/** The carry as hold fields: only the keys that have a value, so a hold never stores an empty string for one. */
export function carryFields(carry: LaunchCarry): Record<string, string> {
  const out: Record<string, string> = {}
  if (carry.handle) out.handle = carry.handle
  if (carry.theme) out.theme = carry.theme
  if (carry.accent) out.accent = carry.accent
  if (carry.host) out.host = carry.host
  return out
}
