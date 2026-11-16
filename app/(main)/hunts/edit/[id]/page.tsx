import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { loadTrail } from '@/lib/hunts/store'
import { TrailEditor } from '@/components/hunts/trail-editor'
import { ReleaseEditionPanel } from './release-edition'

// THE TRAIL EDITOR (FH-013, docs/hunts/CREATOR-FLOW.md steps 2 to 5): add stops, choose the shape,
// preview as a player, publish. The draft and its revision come from the store under the owner gate
// (lib/hunts/authz.ts); a Hunt that is not the caller's to edit answers 404 like one that is not
// there. Dark until HUNTS_AUTHORING_ENABLED is on.
// FH-044S: a Trail with a published edition and an open draft after it publishes by releasing the next
// edition (releaseEditionAction via ReleaseEditionPanel), never by a second first publish: the release
// carries the printed codes and retires the outgoing edition. Versions are only opened after a publish,
// so a draft numbered past 1 always has a published edition before it; the panel's preview re-reads it.
export const metadata: Metadata = { title: 'Edit trail', robots: { index: false } }
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f-]{36}$/i

export default async function EditTrailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!huntSwitchOn('authoring')) notFound()
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const profileId = await getMyProfileId()
  if (!profileId) redirect(`/sign-in?next=/hunts/edit/${id}`)
  const state = await loadTrail(id, { profileId })
  if (!state) notFound()
  const releasing = !state.published && state.versionNo > 1
  return <TrailEditor initial={state} release={releasing ? <ReleaseEditionPanel /> : undefined} />
}
