import { Layers } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { listSegmentsDetailed, describeSegment, type SegmentSummary } from '@/lib/traits/segments'

// Staff-only: saved audiences over tags + computed traits (MEMBER-DATA-PLATFORM.md
// Phase 3). Live member counts + a sample of who's in each — the lists you act on
// for marketing, win-back, and early access. Index/Table (ADR-233 §3.3): the saved
// audiences browse in one DataTable on the canvas.
export const dynamic = 'force-dynamic'

export default async function SegmentsPage() {
  await requireAdmin('janitor', { staff: 'insights', staffLevel: 'read' })

  const segments = await listSegmentsDetailed()

  const columns: ColumnDef<SegmentSummary>[] = [
    {
      key: 'name',
      header: 'Segment',
      render: (s) => (
        <div className="min-w-0">
          <p className="font-semibold text-text">{s.name}</p>
          <p className="mt-0.5 truncate font-mono text-xs text-subtle">{describeSegment(s.definition)}</p>
          {s.description && <p className="mt-1 max-w-md text-xs text-muted">{s.description}</p>}
        </div>
      ),
    },
    {
      key: 'count',
      header: 'Members',
      type: 'number',
      render: (s) => s.count.toLocaleString(),
    },
    {
      key: 'sample',
      header: 'Who is in it',
      render: (s) =>
        s.sample.length === 0 ? (
          <span className="text-xs text-subtle">No members yet</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {s.sample.map((m) => (
              <span
                key={m.handle || m.displayName}
                className="rounded-md bg-surface-elevated px-2 py-0.5 text-xs text-muted"
              >
                {m.handle ? `@${m.handle}` : m.displayName}
              </span>
            ))}
            {s.count > s.sample.length && (
              <span className="px-1 py-0.5 text-xs text-subtle">+{s.count - s.sample.length} more</span>
            )}
          </div>
        ),
    },
  ]

  return (
    <AdminTemplate
      title="Segments"
      eyebrow="Insights"
      icon={Layers}
      description="Saved audiences over member tags and computed traits, with live counts. These are the lists you act on for marketing, win-back, and early access."
      width="wide"
    >
      <AdminSection>
        <DataTable
          rows={segments}
          getRowId={(s) => s.id}
          columns={columns}
          caption="Saved member segments with live counts and a sample of who is in each."
          empty={
            <EmptyState
              variant="first-use"
              icon={Layers}
              title="No segments defined yet"
              description="Saved audiences appear here as you define them over member tags and computed traits."
            />
          }
        />
      </AdminSection>
    </AdminTemplate>
  )
}
