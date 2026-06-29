// Contact redaction for imported housing copy. Members posted phone numbers and
// emails into a PRIVATE group; those must not ride along into public listing copy
// before the poster claims the listing and chooses what to show. This lifts the
// contacts OUT of the body (so the importer can hold them for the claim handshake)
// and leaves a plain placeholder in their place. Pure + unit-tested; idempotent
// (the placeholders carry no digits/@, so a second pass is a no-op).
//
// Scope is deliberate: phones and emails only. @handles and bare URLs are left in —
// an Instagram handle is how a lot of event hosts WANT to be reached, and the event
// path shows organizer contact on purpose (a printed poster is public). Housing is
// the sensitive case, so the housing path is the one that redacts.

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g

// A phone-ish run: an optional + or opening paren, then digits with spaces / dashes /
// dots / parens. We only treat a match as a phone when it carries enough DIGITS to be
// one, so prices ("$1200"), bedroom counts, and dates ("1/15/2024", "/" is not in the
// class) are never mistaken for contacts.
const PHONE_CANDIDATE = /\+?\(?\d[\d\s().\-]{5,}\d/g
const MIN_PHONE_DIGITS = 7
const MAX_PHONE_DIGITS = 15 // E.164 ceiling; longer digit runs are codes/ids, not phones

const EMAIL_PLACEHOLDER = '[email removed]'
const PHONE_PLACEHOLDER = '[number removed]'

function digitCount(s: string): number {
  let n = 0
  for (const ch of s) if (ch >= '0' && ch <= '9') n++
  return n
}

export interface RedactionResult {
  /** The body with phones + emails replaced by plain placeholders. */
  redacted: string
  /** The original contact strings that were lifted out (deduped, trimmed). */
  contacts: string[]
}

/**
 * Strip phone numbers and emails from `text`, returning the cleaned copy plus the
 * contacts that were removed. Emails first (so an email's local part can't be eaten
 * by the phone pass), then phone runs that clear the digit-count guard.
 */
export function redactContacts(text: string): RedactionResult {
  const contacts: string[] = []
  const seen = new Set<string>()
  const keep = (raw: string) => {
    const v = raw.trim()
    if (v && !seen.has(v)) {
      seen.add(v)
      contacts.push(v)
    }
  }

  let out = (text ?? '').replace(EMAIL, (m) => {
    keep(m)
    return EMAIL_PLACEHOLDER
  })

  out = out.replace(PHONE_CANDIDATE, (m) => {
    const digits = digitCount(m)
    if (digits < MIN_PHONE_DIGITS || digits > MAX_PHONE_DIGITS) return m // not a phone
    keep(m)
    return PHONE_PLACEHOLDER
  })

  return { redacted: out, contacts }
}

/** True when `text` carries a phone or email worth redacting — a cheap pre-check
 *  for callers that only want to act when there is something to strip. */
export function hasContact(text: string): boolean {
  if (EMAIL.test(text)) {
    EMAIL.lastIndex = 0
    return true
  }
  EMAIL.lastIndex = 0
  for (const m of text.matchAll(PHONE_CANDIDATE)) {
    const d = digitCount(m[0])
    if (d >= MIN_PHONE_DIGITS && d <= MAX_PHONE_DIGITS) return true
  }
  return false
}
