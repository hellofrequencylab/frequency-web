import Link from 'next/link'
import { MapPin, Sparkles, CalendarPlus, Users, ShieldCheck } from 'lucide-react'
import { getLocalActivity } from '@/lib/feed/density'
import { getLocalitySeedSignal } from '@/lib/keystone/store'
import { canCreate } from '@/lib/core/load-capabilities'
import { NewCircleCompose } from '@/components/compose/new-circle-compose'
import { FounderActionTracker } from '@/components/feed/founder-action'
import type { SeedReadiness } from '@/lib/keystone/density-rollup'
import { trackLocalityResolved, trackFounderPromptShown } from '@/lib/keystone/instrumentation'

// The "your corner" card on the feed (Resonance Feed Phase 2, ADR-416 →
// docs/RESONANCE-FEED-ARCHITECTURE.md §5; the keystone founder-bootstrap surface, Growth
// OS Engine 8, GE8-4). It reads the member's local-activity state and the keystone seed
// signal for their locality, and renders ONE of:
//   • no-location -> a warm nudge to turn location on, with the privacy promise.
//   • founder     -> "be a founder in your corner" + three concrete actions, with the
//                    copy tuned by how cold the corner is (empty / seeding / warm).
//   • active      -> nothing here (the feed already shows the closest activity).
// It also emits the global-to-local instrumentation (GE8-6): a locality-resolved event
// every time the corner is read, and a founder-prompt-shown event when the prompt lands.
// Server Component; the feed wraps it in <Suspense> so it never blocks the stream.
export async function LocalCornerCard({ viewerProfileId }: { viewerProfileId: string }) {
  const [activity, locality] = await Promise.all([
    getLocalActivity(viewerProfileId),
    getLocalitySeedSignal(viewerProfileId),
  ])

  // GE8-6: the global layer placed this member in a locality. Best-effort, one per day.
  trackLocalityResolved(viewerProfileId, { cityKey: locality.cityKey, readiness: locality.signal.readiness })

  if (activity.state === 'active') return null
  if (activity.state === 'no-location') return <LocationNudge />

  // GE8-4: the founder-bootstrap prompt. The keystone seed readiness (empty / seeding /
  // warm) tunes the copy; 'live' never reaches here (the feed read returns 'active').
  trackFounderPromptShown(viewerProfileId, { cityKey: locality.cityKey, readiness: locality.signal.readiness })
  const canStartCircle = await canCreate('circle.create')
  return <FounderPrompt canStartCircle={canStartCircle} readiness={locality.signal.readiness} />
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

// The headline + lead-in, tuned by how cold the corner is. Plain, concrete, never
// narrating the reader's feelings (CONTENT-VOICE): an empty corner is the clearest
// opening; a seeding corner has a spark but nothing to join yet; a warm corner has one
// anchor that a second thing would round out. No em dashes.
const COPY: Record<Exclude<SeedReadiness, 'live'>, { title: string; lead: string }> = {
  empty: {
    title: 'Be a founder in your corner',
    lead: 'Nobody has started anything near you yet. That is the opening. Start the first circle or host the first gathering, and the people nearby will have somewhere to land.',
  },
  seeding: {
    title: 'Plant the first circle near you',
    lead: 'A few people are around, but there is nothing to join yet. Start the first circle or host an event and give them a place to show up.',
  },
  warm: {
    title: 'Add to what is starting near you',
    lead: 'Something is taking root in your corner. One more circle or event helps it hold, so the next person who arrives finds more than one door.',
  },
}

// Shown when the corner has no real pulse yet. An empty corner is an opportunity to seed,
// not a dead end: start the first circle, host the first event, bring a friend. Each
// action is wrapped so the tap is recorded for the global-to-local funnel (GE8-6).
function FounderPrompt({
  canStartCircle,
  readiness,
}: {
  canStartCircle: boolean
  readiness: SeedReadiness
}) {
  // 'live' never reaches here, but the type is the full union; fall back to 'warm' copy.
  const copy = readiness === 'live' ? COPY.warm : COPY[readiness]
  return (
    <section className="rounded-2xl border border-border bg-gradient-to-br from-primary-bg/40 to-signal-bg/30 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
          <Sparkles className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-text">{copy.title}</h3>
          <p className="mt-1 text-sm text-muted">{copy.lead}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <FounderActionTracker action="circle">
              <NewCircleCompose
                buttonLabel="Start a circle"
                canCreate={canStartCircle}
                buttonClass="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
              />
            </FounderActionTracker>
            <FounderActionTracker action="event">
              <Link
                href="/events"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
              >
                <CalendarPlus className="h-4 w-4 text-subtle" /> Host an event
              </Link>
            </FounderActionTracker>
            <FounderActionTracker action="invite">
              <Link
                href="/network"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
              >
                <Users className="h-4 w-4 text-subtle" /> Invite people
              </Link>
            </FounderActionTracker>
          </div>
        </div>
      </div>
    </section>
  )
}
