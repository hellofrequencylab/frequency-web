import { notFound } from 'next/navigation'
import { CircleDot } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate } from '@/components/templates'
import { StatusChip } from '@/components/admin/status'
import { getTemplateBySlug } from '@/lib/circles/templates-data'
import { TemplateEditor } from '@/components/admin/circle-templates/template-editor'
import { PILLAR_LABEL } from '@/components/admin/circle-templates/pillar-label'

// The per-template editor — every field of one circle_templates row, in a focused form
// (AdminTemplate, narrow). Loaded by slug via the service-role read layer so an inactive
// template is still editable. The active toggle + reorder live on the index; this surface
// owns the content. Operator-facing name is "Circle Templates".

export const dynamic = 'force-dynamic'

export default async function CircleTemplateEditorPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  await requireAdmin('host', { staff: 'community' })

  const template = await getTemplateBySlug(slug)
  if (!template) notFound()

  return (
    <AdminTemplate
      title={template.name}
      eyebrow="Circle Template"
      icon={CircleDot}
      description="Edit every field of this Starter Circle blueprint. Changes save to the catalog; turning it on or off and reordering it live on the index."
      width="default"
      back={{ href: '/admin/circle-templates', label: 'Circle Templates' }}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone="neutral" size="sm">
            {PILLAR_LABEL[template.primaryPillar]}
          </StatusChip>
          <StatusChip tone={template.isActive ? 'success' : 'neutral'} size="sm">
            {template.isActive ? 'Active' : 'Inactive'}
          </StatusChip>
        </div>
      }
    >
      <TemplateEditor template={template} />
    </AdminTemplate>
  )
}
