import { Landmark, Building2, Wallet, Receipt } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusChip } from '@/components/admin/status'
import { getFinanceSummary, formatCents, type FinanceTxn } from '@/lib/finance/dashboard'

// The "Finances" tab of the consolidated Insights suite (ADR-263) — formerly /admin/financials.
// The operator view of the entity-partitioned money ledger (ADR-246): Foundation (nonprofit) and
// Labs (for-profit) money never commingle. Read-only + JANITOR-ONLY (re-checked here, and the suite
// hides this tab from non-janitor insights staff).
export async function FinancialsTab() {
  await requireAdmin('janitor')
  const summary = await getFinanceSummary()

  const fmtWhen = (s: string) =>
    new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  const ENTITY_ICON: Record<string, typeof Landmark> = { foundation: Landmark, labs: Building2 }

  const columns: ColumnDef<FinanceTxn>[] = [
    { key: 'occurredAt', header: 'When', render: (t) => <span className="text-muted">{fmtWhen(t.occurredAt)}</span> },
    {
      key: 'entityKey',
      header: 'Entity',
      render: (t) => (
        <StatusChip tone={t.entityKey === 'foundation' ? 'info' : 'neutral'}>
          {t.entityKey === 'foundation' ? 'Foundation' : t.entityKey === 'labs' ? 'Labs' : t.entityKey}
        </StatusChip>
      ),
    },
    { key: 'revenueType', header: 'Type', render: (t) => <span className="capitalize text-text">{t.revenueType}</span> },
    { key: 'sourceTable', header: 'Source', render: (t) => <span className="text-muted">{t.sourceTable ?? '–'}</span> },
    {
      key: 'amountCents',
      header: 'Amount',
      type: 'number',
      render: (t) => <span className="font-semibold tabular-nums text-text">{formatCents(t.amountCents, t.currency)}</span>,
    },
  ]

  return (
    <>
      <AdminSection
        title="Finances"
        description="Money by legal entity. Foundation (nonprofit) and Labs (for-profit) funds are hard-partitioned and never commingle; each is reported on its own here. The ledger fills as ticketing, dues, donations, commerce, and payouts are wired to record into it."
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard bordered icon={Wallet} label="Total recorded" value={formatCents(summary.grandTotalCents)} detail={`${summary.txnCount.toLocaleString()} transactions`} />
          {summary.entities.map((e) => (
            <StatCard
              key={e.entityKey}
              bordered
              icon={ENTITY_ICON[e.entityKey] ?? Receipt}
              label={e.entityName}
              value={formatCents(e.totalCents)}
              detail={`${e.kind === 'nonprofit' ? 'Nonprofit' : 'For-profit'} · ${e.txnCount.toLocaleString()} txns`}
            />
          ))}
        </div>
      </AdminSection>

      {summary.entities.some((e) => Object.keys(e.byType).length > 0) && (
        <AdminSection title="By revenue type" description="Net per entity, broken down by how the money came in.">
          <div className="grid gap-3 sm:grid-cols-2">
            {summary.entities.map((e) => (
              <div key={e.entityKey} className="rounded-2xl border border-border bg-surface p-4">
                <p className="mb-2 text-sm font-semibold text-text">{e.entityName}</p>
                {Object.keys(e.byType).length === 0 ? (
                  <p className="text-sm text-muted">No transactions yet.</p>
                ) : (
                  <ul className="space-y-1">
                    {Object.entries(e.byType).map(([type, cents]) => (
                      <li key={type} className="flex items-center justify-between text-sm">
                        <span className="capitalize text-muted">{type}</span>
                        <span className="font-medium tabular-nums text-text">{formatCents(cents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </AdminSection>
      )}

      <AdminSection title="Recent transactions" description="The latest entries on the ledger, newest first.">
        <DataTable
          rows={summary.recent}
          getRowId={(t) => t.id}
          columns={columns}
          caption="Recent financial ledger entries."
          empty={
            <EmptyState
              variant="first-use"
              icon={Receipt}
              title="No transactions yet"
              description="Entries appear here as ticketing, dues, donations, commerce, and payouts are wired to record into the entity-partitioned ledger."
            />
          }
        />
      </AdminSection>
    </>
  )
}
