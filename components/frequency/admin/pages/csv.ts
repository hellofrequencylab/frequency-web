// THE CONSOLE'S CSV EXPORTS (Contacts' Export, Economy's Statement). Written in the browser from rows the
// server already sent; nothing is fetched. Pure helpers plus one browser-only download call.

/** One CSV cell: quoted when it holds a comma, quote or line break; a leading formula character is
 *  neutralised so a spreadsheet never runs it. PURE. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** The whole file: a header line, then one line per row, CRLF-separated. PURE. */
export function csvText(lines: string[][]): string {
  return lines.map((line) => line.map(csvCell).join(',')).join('\r\n')
}

/** Hand the browser a CSV file to save. Browser only (call it from a click handler). */
export function downloadCsv(filename: string, lines: string[][]): void {
  const url = URL.createObjectURL(new Blob([csvText(lines)], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
