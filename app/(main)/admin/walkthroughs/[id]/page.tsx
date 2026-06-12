import { requireAdmin } from '@/lib/admin/guard'
import { getWalkthroughById, blankWalkthrough } from '@/lib/walkthroughs'
import { WalkthroughEditor } from './editor'

export const dynamic = 'force-dynamic'

// The Walkthrough editor route (Phase A). Marketing-gated. Best-effort load: if the
// `walkthrough` table is absent (pre-migration) or the id isn't found, the editor opens
// on an in-memory draft so the operator can still design slides — Save persists once the
// table exists. The split-layout editing + live preview live in ./editor (a client island).
export default async function WalkthroughEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin('host', { staff: 'marketing' })
  const { id } = await params
  const existing = await getWalkthroughById(id)
  // Fall back to an in-memory draft keyed to the requested id so Save targets the right row
  // once the table exists.
  const walkthrough = existing ?? blankWalkthrough({ id, name: 'New walkthrough' })
  const persisted = !!existing

  return <WalkthroughEditor initial={walkthrough} persisted={persisted} />
}
