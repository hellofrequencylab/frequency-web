import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarDays, ScanLine } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { FocusTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { EntityCard } from '@/components/cards/entity-card'
import { listMyDrafts } from '@/lib/events/event-drafts'
import { posterSignedUrlMap } from '@/lib/events/poster-media'
import type { EventDetailsWithMedia } from '@/lib/events/details-media'
import { DeleteDraftButton } from './delete-button'

export const dynamic = 'force-dynamic'

// "My drafts" — every event the member captured from a poster: drafts still
// being tidied, posted events waiting on an organizer, and claimed ones.
// Owner-scoped end to end (listMyDrafts reads only the caller's rows).
export default async function MyDraftsPage() {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/events/drafts')

  const drafts = await listMyDrafts(profileId)

  // One batched signing call for every cover thumb (cover crop, else poster).
  const thumbPath = (d: (typeof drafts)[number]): string | null =>
    (d.details as EventDetailsWithMedia).media?.coverPath ?? d.posterPath
  const signed = await posterSignedUrlMap(drafts.map(thumbPath).filter((p): p is string => !!p))

  const scanCta = (
    <Link
      href="/events/scan"
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
    >
      <ScanLine className="h-4 w-4" /> Capture a poster
    </Link>
  )

  return (
    <FocusTemplate
      title="My drafts"
      description="Posters you captured, on their way to local events."
      back={{ href: '/events', label: 'Events' }}
      actions={scanCta}
      width="wide"
    >
      {drafts.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No captured events yet"
          description="Spot a poster around town, snap it, and the draft lands here for a quick tidy before it goes live."
          action={scanCta}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {drafts.map((d) => {
            const path = thumbPath(d)
            const url = path ? signed.get(path) : undefined
            const status = !d.removedAt && d.status === 'published'
              ? d.claimedAt
                ? { label: 'Claimed', cls: 'bg-success-bg text-success' }
                : d.hostId
                  ? { label: 'Live', cls: 'bg-success-bg text-success' }
                  : { label: 'Awaiting claim', cls: 'bg-primary-bg text-primary-strong' }
              : d.removedAt
                ? { label: 'Removed', cls: 'bg-danger-bg text-danger' }
                : { label: 'Draft', cls: 'bg-surface-elevated text-muted' }
            return (
              <EntityCard
                key={d.id}
                href={`/events/drafts/${d.id}`}
                anchor={
                  url ? (
                    // Signed URLs are short-lived; plain img, same as the other
                    // private-bucket previews.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" className="h-12 w-12 rounded-xl border border-border object-cover" />
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
                      <CalendarDays className="h-5 w-5" />
                    </span>
                  )
                }
                title={d.title ?? 'Untitled event'}
                badge={
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold ${status.cls}`}>
                    {status.label}
                  </span>
                }
                context={
                  d.startsAt
                    ? new Date(d.startsAt).toLocaleDateString('en-US', {
                        weekday: 'short', month: 'short', day: 'numeric',
                      })
                    : 'No date yet'
                }
                meta={d.location ? <span className="truncate">{d.location}</span> : undefined}
                action={d.status === 'draft' ? <DeleteDraftButton id={d.id} /> : undefined}
              />
            )
          })}
        </div>
      )}
    </FocusTemplate>
  )
}
