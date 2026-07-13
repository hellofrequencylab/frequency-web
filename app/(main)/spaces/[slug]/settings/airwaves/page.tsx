// Airwaves P1 — the Recordings library console (ADR-608 §6, requirement #4). A Space's owner surface for
// uploading Recordings into the Loom, managing the catalog, and choosing where each one plays. Mirrors the
// settings-page pattern (automation / qr): resolve the caller, resolve + gate the Space, feature-lock on the
// `airwaves` function, and frame the body in the FocusTemplate. A plain member (not a manager) gets a
// browse-only view of the Recordings visible to them; a non-member 404s (no existence leak). The chrome is
// auto-registered by the `/settings` pattern in page-chrome.ts, so no rail edit is needed.

import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { listRecordingsForSpace } from '@/lib/airwaves/recordings'
import { listAttachedRecordings } from '@/lib/airwaves/attach-actions'
import { RecordingEngagement } from '@/components/airwaves/recording-engagement'
import { AirwavesConsole } from './airwaves-console'

export const metadata = { title: 'Airwaves' }

export default async function AirwavesConsolePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  const isMember = caps.role !== null
  // A manager (or staff previewer) gets the console; a plain member gets browse-only; anyone else 404s.
  if (!canManage && !staffViewing && !isMember) notFound()

  const brandName = space.brandName ?? space.name

  const featureLocked = !staffViewing && (canManage || isMember)
    ? !spaceFunctionAccess(space, 'airwaves', caps.role)
    : false
  if ((canManage || staffViewing) && featureLocked) {
    return (
      <FocusTemplate
        eyebrow={brandName}
        title="Airwaves"
        description="Turn on Airwaves for this space to host recordings and attach them anywhere."
        back={{ href: `/spaces/${slug}/manage`, label: 'Manage' }}
      >
        <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
          Airwaves is turned off for this space. Turn it on in the module settings to start adding recordings.
        </p>
      </FocusTemplate>
    )
  }

  const recordings = await listRecordingsForSpace(space.id)
  const canEdit = caps.canEditProfile
  const spaceAttachments = canEdit ? await listAttachedRecordings('space', space.id) : []

  // Airwaves P2 — ratings + discussion under each Recording, rendered server-side so the reused
  // ListingQna spine revalidates correctly. A walled private Recording renders nothing (canViewRecording).
  const revalidatePath = `/spaces/${slug}/settings/airwaves`
  const engagementByRecordingId = Object.fromEntries(
    recordings.map((r) => [
      r.id,
      <RecordingEngagement
        key={r.id}
        recording={r}
        viewerProfileId={viewerProfileId}
        isMember={isMember}
        canEdit={canEdit}
        isStaff={staffViewing}
        revalidatePath={revalidatePath}
      />,
    ]),
  )

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Airwaves"
      description={
        canEdit
          ? 'Upload audio and video, manage your recordings, and choose where each one plays.'
          : 'The audio and video recordings shared in this space.'
      }
      width="wide"
      back={canEdit ? { href: `/spaces/${slug}/manage`, label: 'Manage' } : undefined}
    >
      <AirwavesConsole
        slug={slug}
        spaceId={space.id}
        recordings={recordings}
        spaceAttachments={spaceAttachments}
        canEdit={canEdit}
        engagementByRecordingId={engagementByRecordingId}
      />
    </FocusTemplate>
  )
}
