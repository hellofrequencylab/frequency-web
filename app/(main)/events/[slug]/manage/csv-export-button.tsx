'use client'

import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Client-side CSV export for the questionnaire responses. The server already
// shaped the rows (load.loadQuestionnaire); this turns them into a downloadable
// file in the browser, so there's no extra route or round-trip. One column per
// question, one row per respondent.

export type CsvRow = {
  displayName: string
  handle: string
  answers: Record<string, string>
}

export type CsvColumn = { id: string; prompt: string }

function escape(value: string): string {
  // RFC 4180: wrap in quotes and double any embedded quote when the value holds a
  // comma, quote, or newline.
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function CsvExportButton({
  rows,
  columns,
  fileName,
}: {
  rows: CsvRow[]
  columns: CsvColumn[]
  fileName: string
}) {
  const onExport = () => {
    const header = ['Name', 'Handle', ...columns.map((c) => c.prompt)]
    const lines = [header.map(escape).join(',')]
    for (const r of rows) {
      const cells = [
        r.displayName,
        r.handle ? `@${r.handle}` : '',
        ...columns.map((c) => r.answers[c.id] ?? ''),
      ]
      lines.push(cells.map(escape).join(','))
    }
    // Prepend a BOM so Excel opens UTF-8 cleanly.
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <Button variant="secondary" size="sm" onClick={onExport} disabled={rows.length === 0}>
      <Download className="h-3.5 w-3.5" />
      Export CSV
    </Button>
  )
}
