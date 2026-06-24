import Link from 'next/link'
import { CircleDot, Pencil } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { StatusChip } from '@/components/admin/status'
import { EmptyState } from '@/components/ui/empty-state'
import { getAllTemplates, templatesEnabled } from '@/lib/circles/templates-data'
import type { CircleTemplate } from '@/lib/circles/templates'
import { MasterSwitch } from '@/components/admin/circle-templates/master-switch'
import { ActiveToggle, ReorderControls } from '@/components/admin/circle-templates/row-controls'
import { PILLAR_ORDER, PILLAR_LABEL } from '@/components/admin/circle-templates/pillar-label'

// Circle Templates — the operator catalog of the twelve Starter Circle blueprints.
// AdminTemplate shell (PAGE-FRAMEWORK §8.1): the global master switch on top, then a
// DataTable per Pillar (Mind / Body / Spirit / Expression order). Each row carries the
// per-template active toggle, the reorder controls, and a link into the editor. Reads go
// through the service-role layer (getAllTemplates) so inactive templates show too;
// every mutation is staff-gated server-side. Operator-facing name is "Circle Templates";
// the member-facing surface this gates is "Starter Circles".

export const dynamic = 'force-dynamic'

export default async function CircleTemplatesPage() {
  await requireAdmin('host', { staff: 'community' })

  const [templates, enabled] = await Promise.all([getAllTemplates(), templatesEnabled()])

  // Index each template's position across the WHOLE ordered set, so the reorder edge
  // checks (first/last) reflect display_order globally, not within its Pillar group.
  const ordered = [...templates].sort((a, b) => a.displayOrder - b.displayOrder)
  const globalIndex = new Map(ordered.map((t, i) => [t.id, i]))

  const columns: ColumnDef<CircleTemplate>[] = [
    {
      key: 'name',
      header: 'Template',
      render: (t) => (
        <div className="min-w-0">
          <span className="font-medium text-text">{t.name}</span>
          <p className="truncate text-xs text-muted">{t.card}</p>
        </div>
      ),
    },
    {
      key: 'primary_pillar',
      header: 'Primary Pillar',
      render: (t) => (
        <StatusChip tone="neutral" size="sm">
          {PILLAR_LABEL[t.primaryPillar]}
        </StatusChip>
      ),
    },
    {
      key: 'display_order',
      header: 'Order',
      type: 'number',
      width: '120px',
      render: (t) => (
        <div className="flex items-center justify-end gap-2">
          <span className="tabular-nums text-muted">{t.displayOrder}</span>
          <ReorderControls
            id={t.id}
            isFirst={globalIndex.get(t.id) === 0}
            isLast={globalIndex.get(t.id) === ordered.length - 1}
          />
        </div>
      ),
    },
    {
      key: 'is_active',
      header: 'Active',
      align: 'right',
      width: '120px',
      render: (t) => <ActiveToggle id={t.id} active={t.isActive} />,
    },
    {
      key: 'edit',
      header: '',
      align: 'right',
      width: '72px',
      render: (t) => (
        <Link
          href={`/admin/circle-templates/${t.slug}`}
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
        </Link>
      ),
    },
  ]

  const byPillar = PILLAR_ORDER.map((pillar) => ({
    pillar,
    rows: ordered.filter((t) => t.primaryPillar === pillar),
  }))

  return (
    <AdminTemplate
      title="Circle Templates"
      eyebrow="Community"
      icon={CircleDot}
      description="The twelve Starter Circle blueprints members adopt and make their own. Three lean each Pillar. Toggle a template on or off, reorder within the gallery, and open one to edit every field. The master switch below gates the whole member-facing gallery."
      width="wide"
    >
      <AdminSection>
        <MasterSwitch enabled={enabled} />
      </AdminSection>

      {templates.length === 0 ? (
        <AdminSection>
          <EmptyState
            variant="first-use"
            icon={CircleDot}
            title="No Circle Templates yet"
            description="The twelve seeded blueprints appear here once the Starter Circles migrations are applied."
          />
        </AdminSection>
      ) : (
        byPillar.map(({ pillar, rows }) => (
          <AdminSection
            key={pillar}
            title={PILLAR_LABEL[pillar]}
            description={`${rows.length} ${rows.length === 1 ? 'template' : 'templates'} leaning ${PILLAR_LABEL[pillar]}.`}
          >
            <DataTable
              caption={`${PILLAR_LABEL[pillar]} templates`}
              columns={columns}
              rows={rows}
              getRowId={(t) => t.id}
              empty={
                <EmptyState
                  variant="no-results"
                  title={`No ${PILLAR_LABEL[pillar]} templates.`}
                />
              }
            />
          </AdminSection>
        ))
      )}
    </AdminTemplate>
  )
}
