'use client'

import { History } from 'lucide-react'
import { FormSection } from '@/components/admin/form-section'
import { Banner, StatusChip } from '@/components/admin/status'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { AiToggle } from './toggle'
import { ReindexHelpButton } from './reindex-help-button'
import { AutonomyControls } from './autonomy-controls'
import type { getAiControlsData } from './load-ai'
import type { AutonomyControlsData } from './load-autonomy'

// Presentational "AI controls" suite shared by the /admin/ai Settings page and the
// in-place Platform·AI module (ADR-149): master switch + help-index reindex + today's
// spend-vs-cap + the switch audit log. Composed from the admin kit (FormSection / Banner /
// StatusChip / DataTable). `onChanged` is passed by the embedded module so it can
// re-fetch after a toggle/reindex; the page omits it (the inner buttons fall back to a
// router refresh).

type Data = Awaited<ReturnType<typeof getAiControlsData>>
type FeatureRow = Data['rows'][number]

const fmtUsd = (n: number) => `$${n.toFixed(2)}`
const fmtWhen = (s: string | null) =>
  s ? new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''

export function AiControlsView({
  data,
  autonomy,
  onChanged,
}: {
  data: Data
  autonomy?: AutonomyControlsData
  onChanged?: () => void
}) {
  const { enabled, envReady, rows, totalSpend, helpChunks, events } = data

  const usageColumns: ColumnDef<FeatureRow>[] = [
    { key: 'feature', header: 'Feature', render: (r) => <span className="text-text">{r.feature}</span> },
    {
      key: 'spent',
      header: 'Spent today',
      type: 'currency',
      render: (r) => (
        <span className={r.spent >= r.cap ? 'font-semibold text-danger' : 'text-muted'}>{fmtUsd(r.spent)}</span>
      ),
    },
    { key: 'cap', header: 'Daily cap', type: 'currency', render: (r) => <span className="text-subtle">{fmtUsd(r.cap)}</span> },
    {
      key: 'state',
      header: 'State',
      align: 'right',
      render: (r) =>
        r.spent >= r.cap ? (
          <StatusChip tone="danger" size="sm">
            At cap
          </StatusChip>
        ) : (
          <StatusChip tone="success" size="sm">
            OK
          </StatusChip>
        ),
    },
  ]

  return (
    <div>
      {/* Master switch */}
      <FormSection
        title="AI features"
        description={
          <>
            The master switch for every AI surface. Backed by{' '}
            <code className="rounded bg-surface-elevated px-1">platform_flags.ai_enabled</code>. Every change is logged
            below.
          </>
        }
      >
        <div className="space-y-3">
          <AiToggle enabled={enabled} onToggled={onChanged} />
          {!envReady && (
            <Banner tone="warning" title="No ANTHROPIC_API_KEY in this environment">
              AI stays inactive even with the switch on. The live gate is the switch <strong>and</strong> the key.
            </Banner>
          )}
        </div>
      </FormSection>

      {/* Vera autonomous sending — the circuit breaker + graduation controls (default OFF). */}
      {autonomy && <AutonomyControls data={autonomy} />}

      {/* Ask Vera — help index (build/refresh the RAG corpus) */}
      <FormSection
        title="Ask Vera help index"
        description="The corpus Vera retrieves from. Build it once so Vera can answer; re-run after editing help articles (only changes re-embed)."
      >
        <ReindexHelpButton embeddedChunks={helpChunks} onReindexed={onChanged} />
      </FormSection>

      {/* Today's spend vs caps */}
      <FormSection
        title="Today's usage"
        description={
          <>
            Per-feature daily ceilings (<code className="rounded bg-surface-elevated px-1">lib/ai/budget.ts</code>); a
            feature at its cap pauses itself for the day. {fmtUsd(totalSpend)} spent so far today.
          </>
        }
      >
        <DataTable
          rows={rows}
          columns={usageColumns}
          getRowId={(r) => r.feature}
          caption="AI spend versus daily cap, per feature"
          density="compact"
        />
      </FormSection>

      {/* Audit log */}
      <FormSection
        title="Switch history"
        description="Who flipped the AI master switch, and when. The audit trail for the kill switch."
      >
        {events.length === 0 ? (
          <p className="flex items-center gap-1.5 text-sm text-subtle">
            <History className="h-4 w-4" aria-hidden /> No changes recorded yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-3 text-sm">
                <StatusChip tone={e.value ? 'success' : 'danger'} size="sm">
                  {e.value ? 'On' : 'Off'}
                </StatusChip>
                <span className="flex-1 truncate text-muted">
                  {e.who}
                  {e.source !== 'admin' && <span className="text-subtle"> · {e.source}</span>}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-subtle">{fmtWhen(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </FormSection>
    </div>
  )
}
