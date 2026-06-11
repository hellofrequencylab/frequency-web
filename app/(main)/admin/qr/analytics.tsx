'use client'

import { ScanLine, Users, TrendingUp, Nfc } from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { WeekBars } from '@/components/admin/spark-charts'

export interface AnalyticsData {
  total: number
  unique: number
  /** Tapped-tag scans (the rest are printed-QR / direct). */
  nfc: number
  daily: { date: string; count: number }[]
  topCodes: { id: string; title: string; slug: string; total: number; unique: number }[]
}

type TopCode = AnalyticsData['topCodes'][number]

const TOP_CODE_COLUMNS: ColumnDef<TopCode>[] = [
  {
    key: 'title',
    header: 'Code',
    render: (c) => (
      <div className="min-w-0">
        <div className="truncate font-medium text-text">{c.title}</div>
        <div className="text-xs text-subtle">/q/{c.slug}</div>
      </div>
    ),
  },
  { key: 'total', header: 'Scans', type: 'number', render: (c) => <span className="font-semibold text-text">{c.total}</span> },
  { key: 'unique', header: 'Unique', type: 'number', render: (c) => <span className="text-muted">{c.unique}</span> },
]

// Shared by the QR Studio dashboard and /admin/qr/stats. CLIENT component, so it can
// compose the (server-safe) DataTable directly — its render functions just run on the
// client here. The daily-scan bar chart is the tokenized spark-chart kit (WeekBars).
export function Analytics({ data }: { data: AnalyticsData }) {
  const windowTotal = data.daily.reduce((sum, d) => sum + d.count, 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard bordered icon={ScanLine} label="Total scans" value={data.total.toLocaleString()} />
        <StatCard bordered icon={Users} label="Unique members" value={data.unique.toLocaleString()} />
        <StatCard bordered icon={Nfc} label="NFC taps" value={data.nfc.toLocaleString()} />
        <StatCard bordered icon={TrendingUp} label="Last 30 days" value={windowTotal.toLocaleString()} />
      </div>

      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <h2 className="text-sm font-bold text-text">Scans · last 30 days</h2>
        {windowTotal === 0 ? (
          <p className="mt-3 py-6 text-center text-xs text-muted">No scans yet in this window.</p>
        ) : (
          <div className="mt-4 h-28" role="img" aria-label="Daily scans, last 30 days">
            <WeekBars values={data.daily.map((d) => d.count)} height={112} />
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-text">Top dynamic links</h2>
        <DataTable
          rows={data.topCodes}
          getRowId={(c) => c.id}
          columns={TOP_CODE_COLUMNS}
          density="compact"
          caption="Top dynamic links by scan volume"
          empty={
            <div className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-xs text-muted">No dynamic links have been scanned yet.</p>
            </div>
          }
        />
      </section>
    </div>
  )
}
