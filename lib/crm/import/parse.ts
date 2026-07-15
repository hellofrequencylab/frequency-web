// Client-side CSV parse (CRM Master Build Plan Phase 2). Papa Parse runs in the
// browser so the wizard gets instant headers + a sample the moment a file is chosen,
// and the model/commit never need the raw file to derive the shape. The parsed rows
// are sent to the server to STAGE (the full file lives in the staging row); the AI
// mapping assist only ever sees a small sample (privacy).
//
// NOTE (shared seam): the `papaparse` dependency is added by the orchestrator. This
// module is written against `import Papa from 'papaparse'` per the build brief.

import Papa from 'papaparse'
import type { ParsedSource } from './types'

/** Rows are capped when staged; parse a bit above that so the count stays honest. */
const PARSE_ROW_CAP = 5000

/** Parse a chosen CSV File into headers + row objects. Header row becomes the keys;
 *  every value is a trimmed string. Empty lines are skipped. Resolves even on a partial
 *  parse (bad rows are dropped by Papa, never thrown), so a messy file still onboards. */
export function parseCsvFile(file: File): Promise<ParsedSource> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h: string) => h.trim(),
      complete: (results) => {
        const headers = (results.meta.fields ?? []).map((h) => h.trim()).filter(Boolean)
        const rows = (results.data ?? [])
          .filter((r): r is Record<string, string> => !!r && typeof r === 'object')
          .map((r) => {
            const out: Record<string, string> = {}
            for (const h of headers) out[h] = typeof r[h] === 'string' ? (r[h] as string).trim() : ''
            return out
          })
          .filter((r) => Object.values(r).some(Boolean))
        resolve({ headers, rows: rows.slice(0, PARSE_ROW_CAP), rowCount: rows.length })
      },
      error: (err: unknown) => reject(err instanceof Error ? err : new Error('Could not read that CSV.')),
    })
  })
}

/** A small sample of rows for the deterministic auto-map + the AI assist. */
export function sampleRows(source: ParsedSource, n = 8): Record<string, string>[] {
  return source.rows.slice(0, n)
}

// ── Any-format / multi-file staging ──────────────────────────────────────────────
// A CSV/TSV is parsed here (Papa auto-detects the delimiter, so tabs work too). Text the
// parser cannot make sense of is handed to the AI extractor (a server action) which returns
// contacts in THIS canonical shape; sourceFromContacts turns them into a ParsedSource so the
// rest of the pipeline (auto-map -> preview -> commit) treats every file identically.

/** The canonical columns an AI extraction lands under. They match the synonym dictionary
 *  (lib/crm/import/map.ts) so they auto-map to Name/Email/Phone/Company/Notes with no fuss. */
export const EXTRACTED_HEADERS = ['Name', 'Email', 'Phone', 'Company', 'Notes'] as const

/** A contact lifted from free text (mirrors ai.ts ExtractedContact, redeclared here so this
 *  CLIENT-safe module never imports the server-only AI kernel). */
export interface ExtractedContactLike {
  name?: string
  email?: string
  phone?: string
  company?: string
  notes?: string
}

/** Build a ParsedSource from AI-extracted contacts (canonical headers). Empty rows dropped. */
export function sourceFromContacts(contacts: ExtractedContactLike[]): ParsedSource {
  const rows: Record<string, string>[] = []
  for (const c of contacts) {
    const row: Record<string, string> = {
      Name: (c.name ?? '').trim(),
      Email: (c.email ?? '').trim(),
      Phone: (c.phone ?? '').trim(),
      Company: (c.company ?? '').trim(),
      Notes: (c.notes ?? '').trim(),
    }
    if (Object.values(row).some(Boolean)) rows.push(row)
  }
  return { headers: [...EXTRACTED_HEADERS], rows, rowCount: rows.length }
}

/** Merge several parsed files into ONE staged set: the header list is the union (first-seen
 *  order), and every row is filled out to carry all headers (missing = ''), so a single
 *  column mapping applies across files of different shapes. */
export function mergeSources(sources: ParsedSource[]): ParsedSource {
  const headers: string[] = []
  const seen = new Set<string>()
  for (const s of sources) {
    for (const h of s.headers) {
      if (h && !seen.has(h)) {
        seen.add(h)
        headers.push(h)
      }
    }
  }
  const rows: Record<string, string>[] = []
  for (const s of sources) {
    for (const r of s.rows) {
      const out: Record<string, string> = {}
      for (const h of headers) out[h] = typeof r[h] === 'string' ? r[h] : ''
      rows.push(out)
    }
  }
  return { headers, rows: rows.slice(0, PARSE_ROW_CAP), rowCount: rows.length }
}

/** Whether a Papa parse produced a usable delimited table (a header row and at least one
 *  data row across two or more columns). A single blob or a one-column jumble returns false,
 *  so the caller routes it to the AI extractor instead. */
export function looksLikeTable(source: ParsedSource): boolean {
  return source.headers.length >= 2 && source.rows.length >= 1
}
