// ─────────────────────────────────────────────────────────────────────────────
// XLSX / XLS ADAPTER (CRM Master Build Plan Phase 1) — read the FIRST sheet of an Excel
// workbook (header row + data rows) into the same ParsedSource shape the rest of the
// importer speaks. ZERO dependency: a .xlsx is a ZIP of XML parts, so we reuse the ZIP
// engine (zip.ts) to pull out the workbook + shared-strings + first worksheet, then parse
// the (simple, well-specified) SpreadsheetML with light regex. SERVER-ONLY (Node zlib via
// zip.ts), so it never enters the client bundle and adds no spreadsheet library.
//
// Scope on purpose: we need a flat contact table, not a spreadsheet engine. We read cell
// text (shared strings, inline strings, numbers, booleans), place cells by their column
// letter so gaps line up, take the first row as headers, and cap the row count. A legacy
// binary .xls (BIFF, not a ZIP) cannot be read here; the caller surfaces a calm reason.
// FAIL-SAFE: any malformed part yields a clear error string, never a throw.
// ─────────────────────────────────────────────────────────────────────────────

import type { ParsedSource } from './types'
import { readZipEntries } from './zip'

/** Rows to read from the sheet (matches the pipeline's staging cap). */
const MAX_ROWS = 5000

export interface XlsxParseResult {
  source: ParsedSource | null
  /** A calm, member-safe reason when the workbook could not be read (null on success). */
  error: string | null
}

/** Decode the five predefined XML entities plus numeric character references. */
function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => safeCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&') // last, so a literal "&amp;amp;" is not double-decoded
}

function safeCodePoint(n: number): string {
  try {
    return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''
  } catch {
    return ''
  }
}

/** Parse xl/sharedStrings.xml into an ordered array. Each <si> may hold one <t> or several <r><t>
 *  runs (rich text); we concatenate every <t> within an <si>, in order. */
function parseSharedStrings(xml: string): string[] {
  const out: string[] = []
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g
  let m: RegExpExecArray | null
  while ((m = siRe.exec(xml))) {
    const inner = m[1]
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g
    let t: RegExpExecArray | null
    let value = ''
    let sawT = false
    while ((t = tRe.exec(inner))) {
      value += decodeXml(t[1])
      sawT = true
    }
    // An <si/> with no <t> (rare) still holds a slot so indices stay aligned.
    out.push(sawT ? value : '')
  }
  return out
}

/** Column letters (A, B, ... Z, AA, ...) from a cell ref -> 0-based column index. */
function colIndexFromRef(ref: string): number {
  const letters = ref.replace(/[0-9]/g, '')
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** Read the <v> (or inline <is><t>) text of one <c> cell, resolved against the shared strings. */
function cellText(cellXml: string, tAttr: string, shared: string[]): string {
  if (tAttr === 'inlineStr') {
    const t = /<t\b[^>]*>([\s\S]*?)<\/t>/.exec(cellXml)
    return t ? decodeXml(t[1]) : ''
  }
  const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cellXml)
  if (!v) return ''
  const raw = v[1]
  if (tAttr === 's') {
    const idx = parseInt(raw, 10)
    return Number.isInteger(idx) && idx >= 0 && idx < shared.length ? shared[idx] : ''
  }
  if (tAttr === 'str') return decodeXml(raw)
  if (tAttr === 'b') return raw === '1' ? 'TRUE' : 'FALSE'
  // number / date-serial / general: keep the literal text (dates come through as their stored form).
  return decodeXml(raw)
}

/** Parse one worksheet XML into a grid of rows, each a map of column-index -> text. */
function parseSheet(xml: string, shared: string[]): Map<number, string>[] {
  const rows: Map<number, string>[] = []
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g
  let r: RegExpExecArray | null
  while ((r = rowRe.exec(xml))) {
    const rowXml = r[1]
    const cells = new Map<number, string>()
    const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g
    let c: RegExpExecArray | null
    let autoCol = 0
    while ((c = cellRe.exec(rowXml))) {
      const attrs = c[1] ?? c[3] ?? ''
      const body = c[2] ?? ''
      const refMatch = /\br="([A-Z]+\d+)"/.exec(attrs)
      const tMatch = /\bt="([^"]+)"/.exec(attrs)
      const colIdx = refMatch ? colIndexFromRef(refMatch[1]) : autoCol
      autoCol = colIdx + 1
      const text = body ? cellText(body, tMatch ? tMatch[1] : '', shared).trim() : ''
      if (text) cells.set(colIdx, text)
    }
    rows.push(cells)
  }
  return rows
}

/** Pick the first worksheet part by convention: the lowest-numbered xl/worksheets/sheetN.xml. */
function firstSheetName(names: string[]): string | null {
  const sheets = names.filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(n))
  if (!sheets.length) return null
  return sheets.sort((a, b) => {
    const na = parseInt(a.replace(/\D/g, ''), 10)
    const nb = parseInt(b.replace(/\D/g, ''), 10)
    return na - nb
  })[0]
}

/**
 * Parse an XLSX workbook buffer into the first sheet's ParsedSource (header row + data rows).
 * Returns { source: null, error } for anything unreadable (a legacy .xls binary, an empty sheet,
 * a corrupt archive) so the caller can skip it with a calm message.
 */
export function parseXlsxBuffer(buf: Buffer): XlsxParseResult {
  // We want the shared strings + every worksheet part.
  const { entries } = readZipEntries(
    buf,
    (n) => /^xl\/sharedStrings\.xml$/i.test(n) || /^xl\/worksheets\/sheet\d+\.xml$/i.test(n),
  )
  if (!entries.length) {
    // Not a ZIP (a legacy binary .xls), or no worksheet parts inside.
    return { source: null, error: 'We could not read that spreadsheet. Save it as .xlsx or export a .csv.' }
  }

  const byName = new Map(entries.map((e) => [e.name.toLowerCase(), e.bytes]))
  const sharedBytes = byName.get('xl/sharedstrings.xml')
  const shared = sharedBytes ? parseSharedStrings(sharedBytes.toString('utf8')) : []

  const sheetName = firstSheetName(entries.map((e) => e.name))
  const sheetBytes = sheetName ? byName.get(sheetName.toLowerCase()) : undefined
  if (!sheetBytes) return { source: null, error: 'That workbook has no readable sheet.' }

  const grid = parseSheet(sheetBytes.toString('utf8'), shared)
  // Drop leading fully-empty rows so a title-gap before the header does not become the header.
  while (grid.length && grid[0].size === 0) grid.shift()
  if (!grid.length) return { source: null, error: 'That sheet looks empty.' }

  const headerRow = grid[0]
  const maxCol = Math.max(...grid.map((row) => (row.size ? Math.max(...row.keys()) : -1)), -1)
  if (maxCol < 0) return { source: null, error: 'That sheet looks empty.' }

  // Build headers, filling an unnamed column with a stable placeholder so its data still lands
  // somewhere (never dropped) and the header list stays unique.
  const headers: string[] = []
  const usedHeaders = new Set<string>()
  for (let col = 0; col <= maxCol; col++) {
    let h = (headerRow.get(col) ?? '').trim()
    if (!h) h = `Column ${col + 1}`
    let unique = h
    let n = 2
    while (usedHeaders.has(unique.toLowerCase())) unique = `${h} ${n++}`
    usedHeaders.add(unique.toLowerCase())
    headers.push(unique)
  }

  const rows: Record<string, string>[] = []
  for (let i = 1; i < grid.length && rows.length < MAX_ROWS; i++) {
    const row = grid[i]
    const out: Record<string, string> = {}
    for (let col = 0; col <= maxCol; col++) out[headers[col]] = row.get(col) ?? ''
    if (Object.values(out).some(Boolean)) rows.push(out)
  }

  return { source: { headers, rows, rowCount: rows.length }, error: null }
}
