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
