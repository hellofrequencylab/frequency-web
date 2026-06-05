'use client'

import { ScanLine, Users, TrendingUp, Nfc } from 'lucide-react'

export interface AnalyticsData {
  total: number
  unique: number
  /** Tapped-tag scans (the rest are printed-QR / direct). */
  nfc: number
  daily: { date: string; count: number }[]
  topCodes: { id: string; title: string; slug: string; total: number; unique: number }[]
}

export function Analytics({ data }: { data: AnalyticsData }) {
  const peak = Math.max(1, ...data.daily.map((d) => d.count))
  const windowTotal = data.daily.reduce((sum, d) => sum + d.count, 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={ScanLine} label="Total scans" value={data.total} />
        <Stat icon={Users} label="Unique members" value={data.unique} />
        <Stat icon={Nfc} label="NFC taps" value={data.nfc} />
        <Stat icon={TrendingUp} label="Last 30 days" value={windowTotal} />
      </div>

      <section className="rounded-2xl border border-border bg-surface shadow-sm p-4">
        <h2 className="text-sm font-bold text-text">Scans · last 30 days</h2>
        {windowTotal === 0 ? (
          <p className="text-xs text-muted mt-3 py-6 text-center">No scans yet in this window.</p>
        ) : (
          <div className="mt-4 flex items-end gap-0.5 h-28" role="img" aria-label="Daily scans, last 30 days">
            {data.daily.map((d) => (
              <div key={d.date} className="flex-1 group relative flex items-end">
                <div
                  className="w-full rounded-t bg-primary/70 group-hover:bg-primary transition-colors"
                  style={{ height: `${Math.round((d.count / peak) * 100)}%` }}
                  title={`${d.date}: ${d.count}`}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-bold text-text">Top dynamic links</h2>
        </div>
        {data.topCodes.length === 0 ? (
          <p className="text-xs text-muted p-4">No dynamic links have been scanned yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-subtle border-b border-border">
                <th className="px-4 py-2 font-medium">Code</th>
                <th className="px-4 py-2 font-medium text-right">Scans</th>
                <th className="px-4 py-2 font-medium text-right">Unique</th>
              </tr>
            </thead>
            <tbody>
              {data.topCodes.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 min-w-0">
                    <div className="font-medium text-text truncate">{c.title}</div>
                    <div className="text-xs text-subtle">/q/{c.slug}</div>
                  </td>
                  <td className="px-4 py-2 text-right font-semibold text-text">{c.total}</td>
                  <td className="px-4 py-2 text-right text-muted">{c.unique}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ScanLine
  label: string
  value: number
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-subtle">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <p className="mt-1 text-2xl font-bold text-text">{value.toLocaleString()}</p>
    </div>
  )
}
