import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { loadTrail } from '@/lib/hunts/store'
import { TrailEditor } from '@/components/hunts/trail-editor'

// THE TRAIL EDITOR (FH-013, docs/hunts/CREATOR-FLOW.md steps 2 to 5): add stops, choose the shape,
// preview as a player, publish. The draft and its revision come from the store under the owner gate
// (lib/hunts/authz.ts); a Hunt that is not the caller's to edit answers 404 like one that is not
// there. Dark until HUNTS_AUTHORING_ENABLED is on.
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
  // FH-032S: once the Trail has been published and visits can count, the two reading pages are one tap
  // away. Each page checks its own reader: route health needs a role on the Trail, the venue report
  // needs a place on a venue's staff, so the link alone opens nothing.
  const slug = encodeURIComponent(state.slug)
  return (
    <>
      <TrailEditor initial={state} />
      {state.status !== 'draft' && huntSwitchOn('claims') && (
        <nav aria-label="How this trail is doing" className="mx-auto w-full max-w-lg space-y-3 px-4 pb-10">
          <p className="text-body-sm text-muted">
            <Link href={`/hunts/${slug}/health`} className="font-semibold text-text underline underline-offset-4">Route health</Link>
            {' '}is for you and your co-organisers: where players are and which stops slow them down.
          </p>
          <p className="text-body-sm text-muted">
            <Link href={`/hunts/${slug}/report`} className="font-semibold text-text underline underline-offset-4">Venue report</Link>
            {' '}is for the staff of a venue on this trail. Send them the link to see their own counts.
          </p>
        </nav>
      )}
    </>
  )
}
