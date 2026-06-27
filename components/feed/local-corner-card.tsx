import Link from 'next/link'
import { MapPin, Sparkles, CalendarPlus, Users, ShieldCheck } from 'lucide-react'
import { getLocalActivity } from '@/lib/feed/density'
import { canCreate } from '@/lib/core/load-capabilities'
import { NewCircleCompose } from '@/components/compose/new-circle-compose'

// The "your corner" card on the feed (Resonance Feed Phase 2, ADR-416 →
// docs/RESONANCE-FEED-ARCHITECTURE.md §5). It reads the member's local-activity
// state and renders ONE of:
//   • no-location -> a warm nudge to turn location on, with the privacy promise.
//   • founder     -> "be a founder in your neighborhood" + three concrete actions.
//   • active      -> nothing here (the feed already shows the closest activity).
// Server Component; the feed wraps it in <Suspense> so it never blocks the stream.
export async function LocalCornerCard({ viewerProfileId }: { viewerProfileId: string }) {
  const activity = await getLocalActivity(viewerProfileId)
  if (activity.state === 'active') return null
  if (activity.state === 'no-location') return <LocationNudge />
  const canStartCircle = await canCreate('circle.create')
  return <FounderPrompt canStartCircle={canStartCircle} />
}

// Shown when the member has no home location yet. The cardinal-rule promise is the
// whole pitch: we use your approximate neighborhood, never your address.
function LocationNudge() {
  return (
    <section className="rounded-2xl border border-primary-bg bg-primary-bg/40 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
          <MapPin className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-text">See what&rsquo;s happening around you</h3>
          <p className="mt-1 text-sm text-muted">
            Set your location and your feed fills with circles, events, and people nearby. We use your
            approximate neighborhood to do it, never your exact address, and you control who can find you.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href="/settings/profile"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
            >
              <MapPin className="h-4 w-4" /> Set your location
            </Link>
            <span className="inline-flex items-center gap-1 text-xs text-subtle">
              <ShieldCheck className="h-3.5 w-3.5" /> Exact location is never shared
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

// Shown when nobody is around the member yet. An empty corner is their opportunity,
// not a dead end: start the first circle, host the first event, bring a friend.
function FounderPrompt({ canStartCircle }: { canStartCircle: boolean }) {
  return (
    <section className="rounded-2xl border border-border bg-gradient-to-br from-primary-bg/40 to-signal-bg/30 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
          <Sparkles className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-text">Be a founder in your neighborhood</h3>
          <p className="mt-1 text-sm text-muted">
            It&rsquo;s quiet around you for now. That&rsquo;s the opening. Start the first circle, host the
            first gathering, and the people nearby will have somewhere to land.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <NewCircleCompose
              buttonLabel="Start a circle"
              canCreate={canStartCircle}
              buttonClass="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
            />
            <Link
              href="/events"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
            >
              <CalendarPlus className="h-4 w-4 text-subtle" /> Host an event
            </Link>
            <Link
              href="/network"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
            >
              <Users className="h-4 w-4 text-subtle" /> Invite people
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
