'use client'

import { AlertTriangle, History } from 'lucide-react'
import { AiToggle } from './toggle'
import { ReindexHelpButton } from './reindex-help-button'
import type { getAiControlsData } from './load-ai'

// Presentational "AI controls" suite shared by the /admin/ai page and the in-place
// Platform·AI module (ADR-149): master switch + help-index reindex + today's
// spend-vs-cap + the switch audit log. `onChanged` is passed by the embedded module
// so it can re-fetch after a toggle/reindex; the page omits it (the inner buttons fall
// back to a router refresh).

type Data = Awaited<ReturnType<typeof getAiControlsData>>

const fmtUsd = (n: number) => `$${n.toFixed(2)}`
const fmtWhen = (s: string | null) =>
  s ? new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''

export function AiControlsView({ data, onChanged }: { data: Data; onChanged?: () => void }) {
  const { enabled, envReady, rows, totalSpend, helpChunks, events } = data

  return (
    <div className="space-y-4">
      {/* Master switch */}
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-text">AI features</p>
            <p className="mt-0.5 text-xs text-muted">
              Backed by <code className="rounded bg-surface-elevated px-1">platform_flags.ai_enabled</code>. Every change is logged below.
            </p>
          </div>
          <AiToggle enabled={enabled} onToggled={onChanged} />
        </div>

        {!envReady && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-primary/40 bg-primary-bg px-3 py-2 text-xs text-primary-strong">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              No <code>ANTHROPIC_API_KEY</code> is configured in this environment, so AI stays inactive even
              with the switch on. The live gate is the switch <strong>and</strong> the key.
            </span>
          </div>
        )}
      </section>

      {/* Ask Vera — help index (build/refresh the RAG corpus) */}
      <ReindexHelpButton embeddedChunks={helpChunks} onReindexed={onChanged} />

      {/* Today's spend vs caps */}
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-text">
          Today’s usage <span className="font-normal text-subtle">· {fmtUsd(totalSpend)} so far</span>
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-subtle">
                <th className="py-2 pr-4 font-semibold">Feature</th>
                <th className="py-2 pr-4 font-semibold text-right">Spent today</th>
                <th className="py-2 font-semibold text-right">Daily cap</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ feature, spent, cap }) => {
                const over = spent >= cap
                return (
                  <tr key={feature} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-4 text-text">{feature}</td>
                    <td className={`py-2 pr-4 text-right tabular-nums ${over ? 'font-semibold text-danger' : 'text-muted'}`}>{fmtUsd(spent)}</td>
                    <td className="py-2 text-right tabular-nums text-subtle">{fmtUsd(cap)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-subtle">
          Caps are per-feature daily ceilings (<code className="rounded bg-surface-elevated px-1">lib/ai/budget.ts</code>); a feature at its cap pauses itself for the day.
        </p>
      </section>

      {/* Audit log */}
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-1.5">
          <History className="h-4 w-4 text-subtle" />
          <p className="text-sm font-semibold text-text">Switch history</p>
        </div>
        {events.length === 0 ? (
          <p className="text-sm text-subtle">No changes recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-3 text-sm">
                <span
                  className={`inline-flex w-12 shrink-0 justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold ${
                    e.value ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
                  }`}
                >
                  {e.value ? 'On' : 'Off'}
                </span>
                <span className="flex-1 truncate text-muted">
                  {e.who}
                  {e.source !== 'admin' && <span className="text-subtle"> · {e.source}</span>}
                </span>
                <span className="shrink-0 text-xs text-subtle">{fmtWhen(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
