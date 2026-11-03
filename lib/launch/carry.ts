// WHAT A VISITOR BRINGS TO THE LAUNCH (the pure half). A page that collects answers before the launch (today the
// signed-out builder on /create-a-space) writes them into the launch hold's Spotlight answers under these keys;
// the Spotlight step reads them back from here. One list of keys, so the writer and the reader cannot drift.
// PURE and client-safe: no imports from the app, so a probe can run it under node.
//
// The Spotlight form itself reads `name`, `line` and `link`. The keys below ride beside them in the same hold:
// the handle the visitor claimed, the Theme Kit they picked, their accent, the host's name, and (from the v3 builder,
// ADR-1933) their one offer sentence, phone, place, photo choices and the server draft's resume token. The hold
// keeps thirteen keys per step (lib/launch/pending.ts), and name + link + the eleven here are exactly thirteen: a new
// key needs that cap raised first.

export interface LaunchCarry {
  /** A Space handle, lowercase letters and digits with single hyphens inside, 2 to 40 characters. */
  handle?: string
  /** A Theme Kit id (the Mega Theme the Space is dressed in once it exists). createSpace re-validates it. */
  theme?: string
  /** The accent's place in the kit's accent list (lib/create-space/preview-site.ts kitAccents). The Spotlight step
   *  turns it into the new Space's brand colour, which the Space page, its Spotlight and the website all wear. */
  accent?: string
  /** The host's name as the visitor typed it. */
  host?: string
  /** The one sentence they wrote about what they offer (/create-a-space step 2). The Spotlight form reads `line`. */
  line?: string
  /** A phone number for the contact section: digits, spaces and + ( ) - only, up to 30 characters. */
  phone?: string
  /** Where they work, as typed ("A city, or Online"), up to 80 characters. */
  where?: string
  /** Which cover picture they chose on /create-a-space: a theme photo slot (s0, s1...) or their own upload (up). */
  cover?: string
  /** The logo choice: the wordmark, a monogram or an upload. */
  logo?: string
  /** The host photo choice: a theme portrait slot, their initials or an upload. */
  profile?: string
  /** The server draft's resume token (create_space_drafts). The launch claim stamps that draft converted once the
   *  person has signed in, so the draft reminders run until they really arrive, not from the moment they tap Claim. */
  lead?: string
}

/** The photo tokens the hold may carry: a slot, an upload marker, or the drawn choices. Never a file, never a URL
 *  (lib/launch/pending.ts holds short text only; the files stay in the visitor's browser until there is an account). */
const PHOTO_TOKEN = /^(s\d|up|word|mono|initials)$/
const PHONE = /^[\d\s+()-]{3,30}$/
const LINE_MAX = 160
const WHERE_MAX = 80

const HANDLE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const THEME = /^[a-z0-9-]{1,40}$/
/** The same shape as lib/create-space/lead.ts LEAD_TOKEN_RE (restated: this file imports nothing from the app). */
const LEAD = /^[A-Za-z0-9_-]{8,64}$/

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
  const line = typeof answers?.line === 'string' ? answers.line.replace(/\s+/g, ' ').trim().slice(0, LINE_MAX) : ''
  if (line) carry.line = line
  const phone = typeof answers?.phone === 'string' ? answers.phone.trim() : ''
  if (phone && PHONE.test(phone)) carry.phone = phone
  const where = typeof answers?.where === 'string' ? answers.where.replace(/\s+/g, ' ').trim().slice(0, WHERE_MAX) : ''
  if (where) carry.where = where
  for (const key of ['cover', 'logo', 'profile'] as const) {
    const v = answers?.[key]
    if (typeof v === 'string' && PHOTO_TOKEN.test(v)) carry[key] = v
  }
  if (typeof answers?.lead === 'string' && LEAD.test(answers.lead)) carry.lead = answers.lead
  return carry
}

/** The carry as hold fields: only the keys that have a value, so a hold never stores an empty string for one. */
export function carryFields(carry: LaunchCarry): Record<string, string> {
  const out: Record<string, string> = {}
  if (carry.handle) out.handle = carry.handle
  if (carry.theme) out.theme = carry.theme
  if (carry.accent) out.accent = carry.accent
  if (carry.host) out.host = carry.host
  if (carry.line) out.line = carry.line
  if (carry.phone) out.phone = carry.phone
  if (carry.where) out.where = carry.where
  if (carry.cover) out.cover = carry.cover
  if (carry.logo) out.logo = carry.logo
  if (carry.profile) out.profile = carry.profile
  if (carry.lead) out.lead = carry.lead
  return out
}
