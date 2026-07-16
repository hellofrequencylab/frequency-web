// ─────────────────────────────────────────────────────────────────────────────
// IMPORT SAFETY HELPERS (CRM Master Build Plan Phase 3) — PURE + unit-tested. Small,
// framework-free checks the map/preview/commit path leans on:
//   • suggestEmailDomain — spot an obvious mistyped email domain (gmial -> gmail) and
//     offer a fix as a NON-BLOCKING warning (the original is kept unless acted on).
//   • normalizePhone     — best-effort E.164-ish normalization of a phone value, so a
//     stored number reads consistently. Never destructive: an unusable value is returned
//     trimmed, not dropped (validateRow flags the implausible ones).
//   • phoneIsPlausible   — a digits-length sanity check for the row-level flag.
//
// No I/O, no model call. The dedupe keys (phoneKey) still normalize independently, so
// nothing here changes how two rows compare.
// ─────────────────────────────────────────────────────────────────────────────

/** Common consumer email domains, for the typo check. Kept small on purpose: a false
 *  "did you mean" on a real domain is worse than missing an exotic one. */
const KNOWN_DOMAINS = [
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'hotmail.com', 'outlook.com',
  'live.com', 'msn.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com',
  'comcast.net', 'verizon.net',
]

/** Domains that are close misspellings but perfectly valid in their own right, so we never
 *  "correct" them (a real address at one of these is not a typo of a KNOWN domain). */
const DENY_SUGGEST = new Set(['googlemail.com'])

/** Levenshtein distance, capped early. Cheap for the short domain strings we compare. */
function editDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (Math.abs(m - n) > 2) return 3 // too far apart to be a typo we care about
  const prev = new Array<number>(n + 1)
  const curr = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j]
  }
  return prev[n]
}

/**
 * If an email's domain looks like a near-miss of a common one (gmial.com -> gmail.com), return the
 * corrected FULL email. Returns null when the domain is already known, empty, or not close enough to
 * any known domain (so we never nag on a legitimate address). Non-blocking: the caller keeps the
 * original and only surfaces this as a suggestion.
 */
export function suggestEmailDomain(email: string): string | null {
  const at = (email ?? '').lastIndexOf('@')
  if (at <= 0) return null
  const local = email.slice(0, at)
  const domain = email.slice(at + 1).toLowerCase().trim()
  if (!domain || !domain.includes('.')) return null
  if (KNOWN_DOMAINS.includes(domain)) return null
  if (DENY_SUGGEST.has(domain)) return null
  // Only second-guess a domain whose second-level part is long enough that a near-miss is more
  // likely a typo than a real short domain (so a legitimate x.com / q.co is never "corrected").
  const sld = domain.split('.')[0]
  if (sld.length < 4) return null

  let best: { domain: string; dist: number } | null = null
  for (const known of KNOWN_DOMAINS) {
    const dist = editDistance(domain, known)
    if (!best || dist < best.dist) best = { domain: known, dist }
  }
  // Only suggest a very close miss (one or two edits) so we do not "correct" a real domain.
  if (!best || best.dist === 0 || best.dist > 2) return null
  // Guard the too-eager case: a short domain within 2 edits of everything. Require the local part to
  // be intact and the suggested domain to actually differ.
  if (best.domain === domain) return null
  return `${local}@${best.domain}`
}

/** Digits only, or '' when none. */
function digitsOf(v: string): string {
  return (v ?? '').replace(/\D+/g, '')
}

/**
 * Normalize a phone value to an E.164-ish string (best effort, NANP-friendly):
 *   • already starts with '+'      -> keep the leading + and its digits.
 *   • 10 digits                    -> assume +1 (North America) -> +1XXXXXXXXXX.
 *   • 11 digits starting with 1    -> +1XXXXXXXXXX.
 *   • anything else with 7..15 digits -> '+' + digits (a plausible international number).
 *   • too short / too long / no digits -> the trimmed original (validateRow flags it).
 * Never throws, never drops data. The last-10 dedupe key (phoneKey) is derived separately, so a
 * reformatted number still dedupes against the same contact.
 */
export function normalizePhone(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return ''
  const hasPlus = trimmed.startsWith('+')
  const digits = digitsOf(trimmed)
  if (!digits) return trimmed
  if (hasPlus) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : trimmed
  }
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`
  return trimmed
}

/** A phone value is plausible when its digit count sits in the E.164 range (7..15). Mirrors the
 *  validateRow gate; a value below 7 or above 15 digits is flagged (and left blank on the contact). */
export function phoneIsPlausible(raw: string | null | undefined): boolean {
  const len = digitsOf(raw ?? '').length
  return len >= 7 && len <= 15
}
