import { requireAdmin } from '@/lib/admin/guard'
import { FocusTemplate } from '@/components/templates'
import { SegmentComposer } from '../segment-composer'
import { tagOptions, traitOptions } from '../picker-options'

// Create a saved audience (P5). Focus surface (no rail) under /admin/* — the operator
// builds a definition and sees a live member count before saving. Same gate as the index,
// at write level (the mutation guard lives in the server action too; this gates entry).
export const dynamic = 'force-dynamic'

export default async function NewSegmentPage() {
  await requireAdmin('janitor', { staff: 'insights', staffLevel: 'write' })

  return (
    <FocusTemplate
      eyebrow="Insights"
      title="New segment"
      description="A saved audience over member tags and computed traits. Add rules, watch the count, then save it as a list you can act on."
      back={{ href: '/admin/segments', label: 'Segments' }}
      width="wide"
    >
      <SegmentComposer tags={tagOptions()} traits={traitOptions()} />
    </FocusTemplate>
  )
}
