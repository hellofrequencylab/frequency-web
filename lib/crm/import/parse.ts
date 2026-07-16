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
import { parseVcardText } from './vcard'
import { parseJsonText } from './json'
import { parseNotesText } from './notes'

/** Rows are capped when staged; parse a bit above that so the count stays honest. */
const PARSE_ROW_CAP = 5000

/** The slice of a Papa parse result we use. Declared locally because `papaparse` ships without
 *  bundled types in this project, so `Papa` is ambient-any; annotating the callback keeps our
 *  own code free of implicit-any. */
type PapaResultLike = { data: unknown; meta?: { fields?: string[] } }

/** Shared normalizer: Papa's fields + row data -> a clean ParsedSource (header row becomes the
 *  keys, every cell a trimmed string, empty rows dropped, capped). Typed against `unknown` so it
 *  never leans on Papa's ambient types. */
function normalizeParsed(fields: readonly string[] | undefined, data: unknown): ParsedSource {
  const headers = (fields ?? []).map((h) => h.trim()).filter(Boolean)
  const rawRows = Array.isArray(data) ? (data as unknown[]) : []
  const rows: Record<string, string>[] = []
  for (const r of rawRows) {
    if (!r || typeof r !== 'object') continue
    const rec = r as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const h of headers) out[h] = typeof rec[h] === 'string' ? (rec[h] as string).trim() : ''
    if (Object.values(out).some(Boolean)) rows.push(out)
  }
  return { headers, rows: rows.slice(0, PARSE_ROW_CAP), rowCount: rows.length }
}

/** Parse a chosen CSV File into headers + row objects. Resolves even on a partial parse (bad
 *  rows are dropped by Papa, never thrown), so a messy file still onboards. */
export function parseCsvFile(file: File): Promise<ParsedSource> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h: string) => h.trim(),
      complete: (results: PapaResultLike) => resolve(normalizeParsed(results.meta?.fields, results.data)),
      error: (err: unknown) => reject(err instanceof Error ? err : new Error('Could not read that CSV.')),
    })
  })
}

/** Parse CSV TEXT (a string) into the same ParsedSource shape. Used server-side for CSV entries
 *  pulled out of an uploaded ZIP, where there is no browser File to stream. Papa parses a string
 *  synchronously. */
export function parseCsvText(text: string): ParsedSource {
  const results = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h: string) => h.trim(),
  }) as PapaResultLike
  return normalizeParsed(results.meta?.fields, results.data)
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

// ── Local (client-side) file-type routing ────────────────────────────────────────
// The wizard hands EVERY chosen file here first. A format the browser can parse without a
// model or the server (CSV/TSV, vCard, JSON, plain-text notes) is parsed deterministically
// and returned as a ParsedSource. Anything this cannot make sense of returns null, so the
// caller routes it onward (XLSX -> a server action; unstructured text -> the AI extractor).
// FAIL-SAFE: every branch is wrapped so a bad file yields null, never a throw.

const EXT_RE = /\.([a-z0-9]+)$/i

/** The lowercased file extension (without the dot), or ''. */
function extensionOf(name: string): string {
  const m = EXT_RE.exec(name ?? '')
  return m ? m[1].toLowerCase() : ''
}

/** What a local parse produced: the parsed source + which adapter handled it (so the caller can
 *  message "we read your notes" vs "we read your spreadsheet"). */
export interface LocalParse {
  source: ParsedSource
  kind: 'csv' | 'vcard' | 'json' | 'notes'
}

/**
 * Parse a chosen file locally when its type is one the browser can handle (CSV/TSV, vCard, JSON,
 * plain-text notes). Returns null when the type is not locally parseable (XLSX, ZIP, unknown) or
 * when a best-effort text parse found nothing, so the caller falls back to the server / AI path.
 */
export async function parseFileLocally(file: File): Promise<LocalParse | null> {
  const ext = extensionOf(file.name)
  const mime = (file.type || '').toLowerCase()
  try {
    if (ext === 'csv' || ext === 'tsv' || ext === 'tab' || mime === 'text/csv' || mime === 'text/tab-separated-values') {
      const source = await parseCsvFile(file)
      return source.rows.length ? { source, kind: 'csv' } : null
    }
    if (ext === 'vcf' || ext === 'vcard' || mime === 'text/vcard' || mime === 'text/x-vcard') {
      const source = parseVcardText(await file.text())
      return source.rows.length ? { source, kind: 'vcard' } : null
    }
    if (ext === 'json' || mime === 'application/json') {
      const source = parseJsonText(await file.text())
      return source.rows.length ? { source, kind: 'json' } : null
    }
    if (ext === 'txt' || ext === 'text' || mime === 'text/plain') {
      // A .txt might be a clean delimited table OR loose notes. Try the delimited parse first (a
      // tab/comma table with a header row), then fall back to best-effort note parsing.
      const table = await parseCsvFile(file)
      if (looksLikeTable(table)) return { source: table, kind: 'csv' }
      const { source } = parseNotesText(await file.text())
      return source.rows.length ? { source, kind: 'notes' } : null
    }
  } catch {
    return null
  }
  return null
}
