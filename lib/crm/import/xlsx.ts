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

// ── Date styling: turn a date-formatted numeric cell into an ISO date ─────────────
// An Excel date is stored as a plain number (a serial day count) whose CELL STYLE carries a
// date/time number-format. Without the style we cannot tell 44197 (a date) from 44197 (a count), so
// we read xl/styles.xml to learn which style indices (`s="N"` on a cell) are date-formatted, then
// convert those serials to an ISO string. A plain number keeps its literal text (never re-parsed, so
// a long digit string is never mangled into scientific notation).

/** Built-in numFmtId values that render as a date/time (SpreadsheetML §18.8.30). */
const BUILTIN_DATE_FMT_IDS = new Set<number>([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
  45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58,
])

/** Does a custom number-format code render a date/time? Strip literal/quoted/bracketed sections
 *  first (so `[Red]`, `[$-409]`, `"text"`, `\-` never trip it), then look for a date/time token.
 *  A pure number format (0 # . , % E) or `General` has none. */
function isDateFormatCode(code: string): boolean {
  const stripped = code
    .replace(/\[[^\]]*\]/g, '') // [Red], [$-409], [h]
    .replace(/"[^"]*"/g, '') // quoted literal text
    .replace(/\\./g, '') // escaped char
  return /[ymdhs]/i.test(stripped)
}

/** Parse xl/styles.xml into the set of cellXfs indices (the `s` attribute on a cell) that are
 *  date-formatted. Fail-safe: any parse gap yields an empty set (numbers stay literal). */
function parseDateStyles(xml: string): Set<number> {
  const dateXf = new Set<number>()
  if (!xml) return dateXf
  // Custom formats (numFmtId >= 164) declared in <numFmts>: which ids render as dates.
  const customDate = new Set<number>()
  const nfRe = /<numFmt\b[^>]*\/?>/g
  let nf: RegExpExecArray | null
  while ((nf = nfRe.exec(xml))) {
    const id = /\bnumFmtId="(\d+)"/.exec(nf[0])
    const code = /\bformatCode="([^"]*)"/.exec(nf[0])
    if (id && code && isDateFormatCode(decodeXml(code[1]))) customDate.add(parseInt(id[1], 10))
  }
  // The cell-format records: a cell's `s="N"` indexes the Nth <xf> in <cellXfs> (in document order).
  const block = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)
  if (!block) return dateXf
  const xfRe = /<xf\b[^>]*?\/>|<xf\b[^>]*?>[\s\S]*?<\/xf>/g
  let xf: RegExpExecArray | null
  let idx = 0
  while ((xf = xfRe.exec(block[1]))) {
    const id = /\bnumFmtId="(\d+)"/.exec(xf[0])
    if (id) {
      const n = parseInt(id[1], 10)
      if (BUILTIN_DATE_FMT_IDS.has(n) || customDate.has(n)) dateXf.add(idx)
    }
    idx++
  }
  return dateXf
}

/** Convert an Excel serial day-count to an ISO string, or null when it is not a usable date. Uses the
 *  1900 date system via the Unix-epoch offset (serial 25569 = 1970-01-01). A whole serial yields a
 *  date (YYYY-MM-DD); a fractional serial keeps its time (full ISO). */
function excelSerialToISO(serial: number): string | null {
  if (!Number.isFinite(serial) || serial <= 0) return null
  const ms = Math.round((serial - 25569) * 86400 * 1000)
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return null
  const hasTime = Math.abs(serial - Math.round(serial)) > 1e-9
  return hasTime ? d.toISOString() : d.toISOString().slice(0, 10)
}

/** Read the <v> (or inline <is><t>) text of one <c> cell, resolved against the shared strings.
 *  `isDate` marks a numeric cell whose style is a date format, so its serial is rendered as an ISO
 *  date instead of the raw number. */
function cellText(cellXml: string, tAttr: string, shared: string[], isDate: boolean): string {
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
  // A date-styled numeric cell: render the serial as an ISO date.
  if (isDate) {
    const iso = excelSerialToISO(parseFloat(raw))
    if (iso) return iso
  }
  // number / general: keep the literal text (never re-parsed, so a long digit string is not
  // mangled into scientific notation).
  return decodeXml(raw)
}

/** Parse one worksheet XML into a grid of rows, each a map of column-index -> text. `dateStyles` is
 *  the set of cell-style (`s`) indices that carry a date number-format (from xl/styles.xml). */
function parseSheet(xml: string, shared: string[], dateStyles: Set<number>): Map<number, string>[] {
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
      const sMatch = /\bs="(\d+)"/.exec(attrs)
      const colIdx = refMatch ? colIndexFromRef(refMatch[1]) : autoCol
      autoCol = colIdx + 1
      const isDate = sMatch ? dateStyles.has(parseInt(sMatch[1], 10)) : false
      const text = body ? cellText(body, tMatch ? tMatch[1] : '', shared, isDate).trim() : ''
      if (text) cells.set(colIdx, text)
    }
    rows.push(cells)
  }
  return rows
}

/** FALLBACK: pick the first worksheet part by convention — the lowest-numbered
 *  xl/worksheets/sheetN.xml. Used only when the workbook's own sheet order can't be resolved. */
function firstSheetName(names: string[]): string | null {
  const sheets = names.filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(n))
  if (!sheets.length) return null
  return sheets.sort((a, b) => {
    const na = parseInt(a.replace(/\D/g, ''), 10)
    const nb = parseInt(b.replace(/\D/g, ''), 10)
    return na - nb
  })[0]
}

/** Resolve a workbook relationship Target to its package part path (relative to xl/). */
function normalizeSheetTarget(target: string): string {
  const t = target.replace(/^\//, '') // an absolute in-package path ("/xl/worksheets/…")
  return /^xl\//i.test(t) ? t : `xl/${t}` // else relative to the workbook part, which lives in xl/
}

/**
 * The FIRST sheet the way Excel shows it: the first <sheet> in xl/workbook.xml's <sheets> (that is the
 * left-most tab), resolved through xl/_rels/workbook.xml.rels (r:id -> Target) to its worksheet part.
 * The filename number (sheet1.xml) is NOT the tab order, so this is what makes us read the sheet the
 * member actually sees first. Returns null when the parts/relationship are missing, so the caller can
 * fall back to the numeric heuristic.
 */
function resolveFirstSheetName(workbookXml: string, relsXml: string): string | null {
  const sheets = /<sheets\b[^>]*>([\s\S]*?)<\/sheets>/.exec(workbookXml)
  if (!sheets) return null
  const firstSheet = /<sheet\b[^>]*\/?>/.exec(sheets[1])
  if (!firstSheet) return null
  // The relationship id (usually r:id; match any "<prefix>:id" so a non-standard namespace prefix
  // still resolves).
  const rid = /\b[A-Za-z0-9]+:id="([^"]+)"/.exec(firstSheet[0])
  if (!rid) return null
  const relRe = /<Relationship\b[^>]*\/?>/g
  let rel: RegExpExecArray | null
  while ((rel = relRe.exec(relsXml))) {
    const id = /\bId="([^"]+)"/.exec(rel[0])
    if (id && id[1] === rid[1]) {
      const target = /\bTarget="([^"]+)"/.exec(rel[0])
      return target ? normalizeSheetTarget(decodeXml(target[1])) : null
    }
  }
  return null
}

/**
 * Parse an XLSX workbook buffer into the first sheet's ParsedSource (header row + data rows).
 * Returns { source: null, error } for anything unreadable (a legacy .xls binary, an empty sheet,
 * a corrupt archive) so the caller can skip it with a calm message.
 */
export function parseXlsxBuffer(buf: Buffer): XlsxParseResult {
  // We want the shared strings + styles + the workbook order parts + every worksheet part.
  const { entries } = readZipEntries(
    buf,
    (n) =>
      /^xl\/sharedStrings\.xml$/i.test(n) ||
      /^xl\/styles\.xml$/i.test(n) ||
      /^xl\/workbook\.xml$/i.test(n) ||
      /^xl\/_rels\/workbook\.xml\.rels$/i.test(n) ||
      /^xl\/worksheets\/sheet\d+\.xml$/i.test(n),
  )
  if (!entries.length) {
    // Not a ZIP (a legacy binary .xls), or no worksheet parts inside.
    return { source: null, error: 'We could not read that spreadsheet. Save it as .xlsx or export a .csv.' }
  }

  const byName = new Map(entries.map((e) => [e.name.toLowerCase(), e.bytes]))
  const sharedBytes = byName.get('xl/sharedstrings.xml')
  const shared = sharedBytes ? parseSharedStrings(sharedBytes.toString('utf8')) : []
  const stylesBytes = byName.get('xl/styles.xml')
  const dateStyles = stylesBytes ? parseDateStyles(stylesBytes.toString('utf8')) : new Set<number>()

  // The first sheet is the one Excel shows first (workbook <sheets> order via rels), NOT the lowest
  // filename number. Fall back to the numeric heuristic when the workbook parts are missing.
  const workbookBytes = byName.get('xl/workbook.xml')
  const relsBytes = byName.get('xl/_rels/workbook.xml.rels')
  let sheetName: string | null = null
  if (workbookBytes && relsBytes) {
    const resolved = resolveFirstSheetName(workbookBytes.toString('utf8'), relsBytes.toString('utf8'))
    if (resolved && byName.has(resolved.toLowerCase())) sheetName = resolved
  }
  if (!sheetName) sheetName = firstSheetName(entries.map((e) => e.name))
  const sheetBytes = sheetName ? byName.get(sheetName.toLowerCase()) : undefined
  if (!sheetBytes) return { source: null, error: 'That workbook has no readable sheet.' }

  const grid = parseSheet(sheetBytes.toString('utf8'), shared, dateStyles)
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
