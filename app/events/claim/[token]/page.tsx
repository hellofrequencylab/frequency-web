import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CalendarDays, MapPin, Zap } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { posterSignedUrl } from '@/lib/events/poster-media'
import type { EventDetailsWithMedia } from '@/lib/events/details-media'
import { FocusTemplate } from '@/components/templates'
import { ClaimButton } from './claim-button'

export const dynamic = 'force-dynamic'

// The claim landing an organizer reaches from the outreach message — PUBLIC
// (outside the (main) shell, like /join/[token]) so a signed-out organizer can
// see what they are claiming. Resolves the published, UNCLAIMED event by its
// one-time token; 404 when the token is unknown, already used, or the event was
// removed, so a guessed token learns nothing. Signed-out → a sign-in CTA that
// returns here; signed-in → one-tap claim (the engine's claimEvent does the
// checks and the ownership transfer).
export default async function ClaimEventPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token || token.length < 8) notFound()

  const admin = createAdminClient()
  const { data } = await admin
    .from('events')
    .select(
      'id, title, description, location, starts_at, slug, status, host_id, claimed_at, removed_at, poster_path, details, posted_by_profile_id, organizer_name',
    )
    .eq('claim_token', token)
    .eq('status', 'published')
    .maybeSingle()

  const ev = data as {
    id: string
    title: string | null
    description: string | null
    location: string | null
    starts_at: string | null
    slug: string | null
    host_id: string | null
    claimed_at: string | null
    removed_at: string | null
    poster_path: string | null
    details: EventDetailsWithMedia | null
    posted_by_profile_id: string | null
    organizer_name: string | null
  } | null

  if (!ev || ev.host_id || ev.claimed_at || ev.removed_at) notFound()

  // Who put it on the map (the credit line).
  let posterName: string | null = null
  if (ev.posted_by_profile_id) {
    const { data: poster } = await admin
      .from('profiles')
      .select('display_name')
      .eq('id', ev.posted_by_profile_id)
      .maybeSingle()
    posterName = (poster as { display_name?: string | null } | null)?.display_name ?? null
  }

  const coverUrl = await posterSignedUrl(ev.details?.media?.coverPath ?? ev.poster_path)
  const myProfileId = await getMyProfileId()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-16">
      <FocusTemplate
        width="narrow"
        divider={false}
        title="Claim your event"
        description={
          posterName
            ? `This event was posted by ${posterName}. If it is yours, claim it to manage it.`
            : 'This event was posted by a community member. If it is yours, claim it to manage it.'
        }
      >
      <div className="w-full space-y-4">
        {/* The event preview. */}
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          {coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt="" className="max-h-56 w-full object-cover" />
          )}
          <div className="p-4">
            <p className="text-base font-bold text-text">{ev.title ?? 'Untitled event'}</p>
            <div className="mt-2 space-y-1 text-sm text-muted">
              {ev.starts_at && (
                <p className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 shrink-0 text-subtle" />
                  {new Date(ev.starts_at).toLocaleString('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
                  })}
                </p>
              )}
              {ev.location && (
                <p className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0 text-subtle" />
                  {ev.location}
                </p>
              )}
            </div>
            {ev.description && (
              <p className="mt-3 text-sm leading-relaxed text-text">{ev.description}</p>
            )}
          </div>
        </div>

        {/* What claiming does. */}
        <p className="flex items-start gap-2 text-sm text-muted">
          <Zap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          Claiming makes you the host: you can edit the details, see RSVPs, and run the event
          from your own account. It takes one tap.
        </p>

        {myProfileId ? (
          <ClaimButton token={token} />
        ) : (
          <div className="space-y-2">
            <Link
              href={`/sign-in?next=/events/claim/${token}`}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
            >
              Sign in to claim it
            </Link>
            <p className="text-center text-xs text-subtle">
              New here? Signing in creates your account in a minute.
            </p>
          </div>
        )}
      </div>
      </FocusTemplate>
    </div>
  )
}
