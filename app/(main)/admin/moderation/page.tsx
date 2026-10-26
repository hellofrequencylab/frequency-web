import { requireAdmin } from '@/lib/admin/guard'
import { FqModerationBody } from '@/components/frequency/admin/pages/moderation/moderation-body'

// MODERATION — the Member Admin Moderation page over the community report queue. The host floor or a
// community staff role gates the whole route; the body reads the pending reports and acts on them.
export default async function ModerationPage() {
  await requireAdmin('host', { staff: 'community' })
  return <FqModerationBody />
}
