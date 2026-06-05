import type { SupabaseClient } from '@supabase/supabase-js'
import { Power, AlertTriangle, History } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { aiEnabledFlag, listFlagEvents } from '@/lib/platform-flags'
import { aiEnabled as envAiReady } from '@/lib/ai/client'
import { FEATURE_DAILY_CAP_USD, dailyCapFor } from '@/lib/ai/budget'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminPage } from '@/components/admin/admin-page'
import { AiToggle } from './toggle'
import { ReindexHelpButton } from './reindex-help-button'

export const dynamic = 'force-dynamic'

const fmtUsd = (n: number) => `$${n.toFixed(2)}`
const fmtWhen = (s: string | null) =>
  s ? new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''

export default async function AiControlsPage() {
  await requireAdmin('janitor')

  const [enabled, events] = await Promise.all([aiEnabledFlag(), listFlagEvents('ai_enabled', 15)])
  const envReady = envAiReady()

  const admin = createAdminClient() as unknown as SupabaseClient
  const since = new Date()
  since.setUTCHours(0, 0, 0, 0)
  const { data: usageRows } = await admin
    .from('ai_usage')
    .select('feature, cost_usd')
    .gte('created_at', since.toISOString())

  const spend = new Map<string, number>()
  for (const r of (usageRows ?? []) as { feature: string; cost_usd: number }[]) {
    spend.set(r.feature, (spend.get(r.feature) ?? 0) + Number(r.cost_usd))
  }
  const features = Array.from(new Set([...Object.keys(FEATURE_DAILY_CAP_USD), ...spend.keys()])).sort()
  const totalSpend = Array.from(spend.values()).reduce((a, b) => a + b, 0)

  // "Ask Vera" retrieves from help_chunks; surface the count so an empty index
  // (the reason Vera deflects) is obvious + one-click fixable.
  const { count: helpChunks } = await admin
    .from('help_chunks')
    .select('id', { count: 'exact', head: true })

  // Resolve who toggled the flag (for the audit log).
  const ids = [...new Set(events.map((e) => e.changedBy).filter((x): x is string => !!x))]
  const names = new Map<string, string>()
  if (ids.length) {
    const { data } = await admin.from('profiles').select('id, display_name').in('id', ids)
    for (const p of (data ?? []) as { id: string; display_name: string | null }[]) {
      names.set(p.id, p.display_name ?? 'Unknown')
    }
  }

  return (
    <AdminPage
      title="AI controls"
      icon={Power}
      eyebrow="Platform"
      description="The master switch for every AI surface — Vera, win-back drafts, help search, and the Profile Creator harvest. Flipping it off makes all of them fall back to their deterministic, non-AI behaviour."
    >
      {/* Master switch */}
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-text">AI features</p>
            <p className="mt-0.5 text-xs text-muted">
              Backed by <code className="rounded bg-surface-elevated px-1">platform_flags.ai_enabled</code>. Every change is logged below.
            </p>
          </div>
          <AiToggle enabled={enabled} />
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
      <ReindexHelpButton embeddedChunks={helpChunks ?? 0} />

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
              {features.map((f) => {
                const s = spend.get(f) ?? 0
                const cap = dailyCapFor(f)
                const over = s >= cap
                return (
                  <tr key={f} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-4 text-text">{f}</td>
                    <td className={`py-2 pr-4 text-right tabular-nums ${over ? 'font-semibold text-danger' : 'text-muted'}`}>{fmtUsd(s)}</td>
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
                  {e.changedBy ? (names.get(e.changedBy) ?? 'Unknown') : 'System'}
                  {e.source !== 'admin' && <span className="text-subtle"> · {e.source}</span>}
                </span>
                <span className="shrink-0 text-xs text-subtle">{fmtWhen(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminPage>
  )
}
