import { requireAdmin } from '@/lib/admin/guard'
import EntryPointsPage from '@/app/(main)/entry-points/page'

// The operator console's door to Entry points (Growth, Acquisition). The page itself is the member tool at
// /entry-points, free for every signed-in member; staff open it here so it sits inside the console with the
// rest of its section instead of in the member shell. Same gate as its menu row: host and up, or the
// marketing staff domain.
export const dynamic = 'force-dynamic'

export default async function AdminEntryPoints() {
  await requireAdmin('host', { staff: 'marketing' })
  return <EntryPointsPage />
}
