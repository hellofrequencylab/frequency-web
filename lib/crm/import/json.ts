// ─────────────────────────────────────────────────────────────────────────────
// JSON ADAPTER (CRM Master Build Plan Phase 1) — turn a JSON contacts export into the
// same ParsedSource shape parse.ts emits. Accepts an array of objects, or an object
// with a `contacts` / `data` / `records` array. Keys become headers (union, first-seen
// order); values are flattened ONE level (a nested object/array becomes a compact
// string so nothing is lost, but we never explode nested shapes into columns). PURE +
// unit-tested, client-safe. FAIL-SAFE: invalid JSON yields an empty ParsedSource, never
// a throw.
// ─────────────────────────────────────────────────────────────────────────────

import type { ParsedSource } from './types'

/** Coerce ONE JSON value to a flat cell string. Scalars stringify plainly; a nested object/array
 *  is JSON-stringified and capped, so a column like `address: {...}` keeps its data as one cell. */
function toCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v).slice(0, 500)
  } catch {
    return ''
  }
}

/** Pull the contacts array out of whatever top-level shape the file has. */
function extractArray(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) return parsed.filter(isPlainObject)
  if (isPlainObject(parsed)) {
    for (const key of ['contacts', 'data', 'records', 'items', 'results']) {
      const v = (parsed as Record<string, unknown>)[key]
      if (Array.isArray(v)) return v.filter(isPlainObject)
    }
    // A single object with no wrapper array is treated as one contact.
    return [parsed as Record<string, unknown>]
  }
  return []
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** Parse the text of a .json file into headers + rows. */
export function parseJsonText(text: string): ParsedSource {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { headers: [], rows: [], rowCount: 0 }
  }

  const objects = extractArray(parsed)
  if (!objects.length) return { headers: [], rows: [], rowCount: 0 }

  // Union of keys across every object, first-seen order, so a ragged export still lines up.
  const headers: string[] = []
  const seen = new Set<string>()
  for (const obj of objects) {
    for (const key of Object.keys(obj)) {
      const h = key.trim()
      if (h && !seen.has(h)) {
        seen.add(h)
        headers.push(h)
      }
    }
  }
  if (!headers.length) return { headers: [], rows: [], rowCount: 0 }

  const rows: Record<string, string>[] = []
  for (const obj of objects) {
    const row: Record<string, string> = {}
    for (const h of headers) row[h] = toCell(obj[h])
    if (Object.values(row).some(Boolean)) rows.push(row)
  }

  return { headers, rows, rowCount: rows.length }
}
