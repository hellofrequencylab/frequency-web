import { notFound, redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/admin/guard'
import { FocusTemplate } from '@/components/templates'
import { getSegment } from '@/lib/traits/segments'
import { SegmentComposer } from '../../segment-composer'
import { tagOptions, traitOptions } from '../../picker-options'

// Edit a saved audience (P5). Focus surface; same write gate as create. System segments are
// not editable (they're seed-managed) — bounce back to the index. The mutation guard +
// system refusal are re-enforced in the server action too; this just keeps the operator out
// of a dead-end form.
export const dynamic = 'force-dynamic'

export default async function EditSegmentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin('janitor', { staff: 'insights', staffLevel: 'write' })
  const { id } = await params

  const segment = await getSegment(id)
  if (!segment) notFound()
  if (segment.is_system) redirect('/admin/segments')

  return (
    <FocusTemplate
      eyebrow="Insights"
      title="Edit segment"
      description="Adjust the rules and watch the live count update before you save."
      back={{ href: '/admin/segments', label: 'Segments' }}
      width="wide"
    >
      <SegmentComposer
        tags={tagOptions()}
        traits={traitOptions()}
        initial={{
          id: segment.id,
          name: segment.name,
          description: segment.description ?? '',
          definition: segment.definition,
        }}
      />
    </FocusTemplate>
  )
}
