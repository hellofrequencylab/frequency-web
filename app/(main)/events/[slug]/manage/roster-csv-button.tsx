'use client'

import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

// The guest list as a spreadsheet (LIVE-2548): one row per person on the roster, with what they hold
// (tier, seats, amount) and whether they were marked present. The server shaped the rows; this turns
// them into a file in the browser, the same way the questionnaire export does.

export type RosterCsvRow = {
  name: string
  email: string
  status: string
  tier: string
  tickets: string
  amount: string
  attended: string
  joined: string
}

const HEADER: [keyof RosterCsvRow, string][] = [
  ['name', 'Name'],
  ['email', 'Email'],
  ['status', 'Status'],
  ['tier', 'Ticket type'],
  ['tickets', 'Tickets'],
  ['amount', 'Paid'],
  ['attended', 'Attended'],
  ['joined', 'Joined'],
]

function escape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function rosterCsv(rows: RosterCsvRow[]): string {
  const lines = [HEADER.map(([, label]) => escape(label)).join(',')]
  for (const r of rows) lines.push(HEADER.map(([key]) => escape(r[key] ?? '')).join(','))
  return lines.join('\r\n')
}

export function RosterCsvButton({ rows, fileName }: { rows: RosterCsvRow[]; fileName: string }) {
  const onExport = () => {
    const blob = new Blob(['﻿' + rosterCsv(rows)], { type: 'text/csv;charset=utf-8' })
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
