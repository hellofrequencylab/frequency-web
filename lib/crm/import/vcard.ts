// ─────────────────────────────────────────────────────────────────────────────
// vCARD ADAPTER (CRM Master Build Plan Phase 1) — turn a .vcf file (one or many
// contact cards) into the same ParsedSource shape parse.ts emits, so the rest of the
// pipeline (auto-map -> preview -> commit) treats a vCard exactly like a CSV. PURE +
// unit-tested, no I/O, client-safe (the wizard reads the file text and calls this).
//
// Maps the common properties: FN / N -> Name, EMAIL -> Email, TEL -> Phone, BDAY ->
// Birthday, ADR -> Address. Multiple cards become multiple rows. FAIL-SAFE: a malformed
// card contributes whatever fields it has and never throws; a file with no cards yields
// an empty ParsedSource.
// ─────────────────────────────────────────────────────────────────────────────

import type { ParsedSource } from './types'

/** The canonical headers a vCard lands under. Name/Email/Phone auto-map to the target fields;
 *  Birthday + Address fall through to custom fields (there is no such target), which is exactly
 *  what the brief asks for (BDAY -> birthday, ADR -> address). */
export const VCARD_HEADERS = ['Name', 'Email', 'Phone', 'Birthday', 'Address'] as const

/** Unescape a vCard TEXT value: \n -> newline, and \\ \, \; \: back to their literal chars. */
function unescapeValue(v: string): string {
  return v.replace(/\\([nN,;:\\])/g, (_m, ch: string) => (ch === 'n' || ch === 'N' ? '\n' : ch))
}

/** Split a structured value (N, ADR) on UNescaped semicolons into its components. */
function splitComponents(v: string): string[] {
  const out: string[] = []
  let cur = ''
  for (let i = 0; i < v.length; i++) {
    const ch = v[i]
    if (ch === '\\' && i + 1 < v.length) {
      cur += ch + v[i + 1]
      i++
    } else if (ch === ';') {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map(unescapeValue)
}

/** Unfold folded lines: per RFC 6350 a line beginning with a space or tab is a continuation of the
 *  previous line. We also tolerate CRLF and lone CR line endings. */
function unfold(text: string): string[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) {
      out[out.length - 1] += line.slice(1)
    } else {
      out.push(line)
    }
  }
  return out
}

/** One parsed vCard line: the property name (upper-cased), its params, and the raw value. */
function parseLine(line: string): { name: string; value: string } | null {
  const colon = line.indexOf(':')
  if (colon < 0) return null
  const left = line.slice(0, colon)
  const value = line.slice(colon + 1)
  // The property name is everything up to the first ';' (params follow). Strip a group prefix
  // ("item1.EMAIL" -> "EMAIL"), which Apple exports add.
  const nameWithParams = left.split(';')[0]
  const name = nameWithParams.includes('.') ? nameWithParams.split('.').pop()! : nameWithParams
  return { name: name.trim().toUpperCase(), value }
}

/** Compose a display name from an N (structured) value: "Family;Given;Middle;Prefix;Suffix". */
function nameFromN(value: string): string {
  const [family = '', given = '', middle = ''] = splitComponents(value)
  return [given, middle, family].map((p) => p.trim()).filter(Boolean).join(' ')
}

/** Compose a one-line address from an ADR value: components are
 *  "POBox;Ext;Street;Locality;Region;Postal;Country"; we keep the human-meaningful parts. */
function addressFromAdr(value: string): string {
  const parts = splitComponents(value)
  const [, , street = '', locality = '', region = '', postal = '', country = ''] = parts
  return [street, locality, region, postal, country].map((p) => p.trim()).filter(Boolean).join(', ')
}

/** Parse the text of a .vcf file into rows (one per BEGIN:VCARD..END:VCARD card). */
export function parseVcardText(text: string): ParsedSource {
  const rows: Record<string, string>[] = []
  if (!text || !/BEGIN:VCARD/i.test(text)) {
    return { headers: [...VCARD_HEADERS], rows, rowCount: 0 }
  }
  const lines = unfold(text)
  let card: Record<string, string> | null = null
  let sawFn = false

  const commit = () => {
    if (card && Object.values(card).some(Boolean)) rows.push(card)
    card = null
    sawFn = false
  }

  for (const raw of lines) {
    const trimmed = raw.trim()
    if (/^BEGIN:VCARD$/i.test(trimmed)) {
      card = { Name: '', Email: '', Phone: '', Birthday: '', Address: '' }
      sawFn = false
      continue
    }
    if (/^END:VCARD$/i.test(trimmed)) {
      commit()
      continue
    }
    if (!card) continue
    const parsed = parseLine(raw)
    if (!parsed) continue
    const value = unescapeValue(parsed.value).trim()
    if (!value && parsed.name !== 'N') continue
    switch (parsed.name) {
      case 'FN':
        // A formatted name always wins over a composed N.
        card.Name = value
        sawFn = true
        break
      case 'N':
        if (!sawFn && !card.Name) card.Name = nameFromN(parsed.value)
        break
      case 'EMAIL':
        if (!card.Email) card.Email = value.toLowerCase()
        break
      case 'TEL':
        if (!card.Phone) card.Phone = value
        break
      case 'BDAY':
        if (!card.Birthday) card.Birthday = value
        break
      case 'ADR':
        if (!card.Address) card.Address = addressFromAdr(parsed.value)
        break
      default:
        break
    }
  }
  // A file that never closed its last card (truncated) still contributes what it had.
  commit()

  return { headers: [...VCARD_HEADERS], rows, rowCount: rows.length }
}
