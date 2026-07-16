// ─────────────────────────────────────────────────────────────────────────────
// PLAIN-TEXT / NOTES ADAPTER (CRM Master Build Plan Phase 1) — the "a simple note from
// their phone" case. Best-effort, line by line, deterministic (no model): pull a contact
// out of each line where we can, and DROP the rest to a skipped count. Never throws.
// Handles the common shapes:
//   • one email per line                      -> Email
//   • "Name <email>"                          -> Name + Email
//   • "name, email, phone" (comma / tab / ;)  -> Name + Email + Phone (any order)
//   • a line with an email or phone somewhere -> that field, with leading text as the name
// A line with neither an email nor a phone is unparseable and counts toward `skipped`.
//
// This runs BEFORE the AI free-text extractor: a note that parses deterministically never
// needs the model. Client-safe + PURE + unit-tested.
// ─────────────────────────────────────────────────────────────────────────────

import type { ParsedSource } from './types'

/** The canonical headers a parsed note lands under (auto-map to Name/Email/Phone). */
export const NOTES_HEADERS = ['Name', 'Email', 'Phone'] as const

const EMAIL_RE = /[^\s,;<>]+@[^\s,;<>]+\.[^\s,;<>]+/
const ANGLE_EMAIL_RE = /^(.*?)<\s*([^\s<>]+@[^\s<>]+\.[^\s<>]+)\s*>\s*$/

/** A token that reads as a phone: 7..15 digits, only phone punctuation. */
function looksLikePhone(v: string): boolean {
  const digits = v.replace(/\D+/g, '')
  return digits.length >= 7 && digits.length <= 15 && /^[+()\d\s.\-]+$/.test(v.trim())
}

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
}

/** Parse ONE line into a contact, or null when there is nothing usable (an email or a phone). */
function parseLine(line: string): { Name: string; Email: string; Phone: string } | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  // "Name <email>"
  const angle = trimmed.match(ANGLE_EMAIL_RE)
  if (angle) {
    return { Name: angle[1].trim().replace(/[",]+$/, '').trim(), Email: angle[2].toLowerCase(), Phone: '' }
  }

  // Delimited "name, email, phone" (any order): split on comma / tab / semicolon.
  if (/[,;\t]/.test(trimmed)) {
    const parts = trimmed.split(/[,;\t]/).map((p) => p.trim()).filter(Boolean)
    let email = ''
    let phone = ''
    const nameParts: string[] = []
    for (const p of parts) {
      if (!email && isEmail(p)) email = p.toLowerCase()
      else if (!phone && looksLikePhone(p)) phone = p
      else nameParts.push(p)
    }
    if (email || phone) return { Name: nameParts.join(' ').trim(), Email: email, Phone: phone }
    return null
  }

  // A bare or embedded email, with any leading text as the name.
  const emailMatch = trimmed.match(EMAIL_RE)
  if (emailMatch) {
    const email = emailMatch[0].toLowerCase()
    const name = trimmed.replace(emailMatch[0], '').trim().replace(/[",<>]+$/, '').trim()
    return { Name: name, Email: email, Phone: '' }
  }

  // A bare phone line (whitespace-separated digits only).
  if (looksLikePhone(trimmed)) {
    return { Name: '', Email: '', Phone: trimmed }
  }

  return null
}

/** Parse plain-text notes into a ParsedSource plus a count of lines we could not use. */
export function parseNotesText(text: string): { source: ParsedSource; skipped: number } {
  const rows: Record<string, string>[] = []
  let skipped = 0
  for (const line of (text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    if (!line.trim()) continue
    const parsed = parseLine(line)
    if (parsed && (parsed.Email || parsed.Phone)) rows.push(parsed)
    else skipped++
  }
  return { source: { headers: [...NOTES_HEADERS], rows, rowCount: rows.length }, skipped }
}
