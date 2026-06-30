// One application track's form (Growth OS Engine 3, GE3-2/GE3-3, ADR-456). Shows the
// track's plain questions, or "your application is in review" when the member already
// has one open. Composes the Focus kit. Server resolves the caller + any open
// application; the client form dispatches the gated apply action.

import { notFound, redirect } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { getCallerProfile } from '@/lib/auth'
import { getTrack, STATUS_LABEL } from '@/lib/applications/tracks'
import { getOpenApplication } from '@/lib/applications/store'
import { ApplyForm } from './apply-form'

export const dynamic = 'force-dynamic'

export default async function ApplyTrackPage({ params }: { params: Promise<{ track: string }> }) {
  const { track: trackId } = await params
  const track = getTrack(trackId)
  if (!track) notFound()

  const me = await getCallerProfile()
  if (!me) redirect('/sign-in?next=/apply')

  const open = await getOpenApplication(me.id, track.id)

  return (
    <FocusTemplate
      eyebrow="Apply"
      title={track.label}
      description={track.blurb}
      back={{ href: '/apply', label: 'Apply' }}
      width="default"
    >
      {open ? (
        <EmptyState
          variant="cleared"
          title="Your application is in."
          description={`We have it, and a real person reads every one. Status: ${STATUS_LABEL[open.status]}. We will be in touch.`}
        />
      ) : (
        <ApplyForm
          track={track.id}
          questions={track.questions.map((q) => ({
            key: q.key,
            label: q.label,
            hint: q.hint ?? null,
            short: !!q.short,
            required: !!q.required,
          }))}
        />
      )}
    </FocusTemplate>
  )
}
