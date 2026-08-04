import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Users, MapPin, Sparkles } from 'lucide-react'
import { IndexTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { PersonCard } from '@/components/cards/person-card'
import { UnderlineTabs } from '@/components/admin/underline-tabs'
import { getMyProfileId } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  fitChips,
  getSeekerProfile,
  matchRoommates,
  matchRoommateSeekers,
  seekerPreferencesToLifestyle,
} from '@/lib/listings/housing'
import { MarketplaceFacets } from '@/components/marketplace/facet-nav'
import { SeekerForm } from './seeker-form'

// Roommate matching — the seeker half. A member says what they're looking for; the
// consent-gated resonance RPCs rank BOTH roommate listings ("Rooms") and other active
// seekers ("People") by member-to-member compatibility + budget fit + coarse geo +
// timing + lifestyle. Coordinates never leave the DB; we show a match score plus
// plain-English fit chips (never astrology, never raw resonance — ADR-861).

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Roommate matches' }

function dollars(cents: number | null): string {
  return cents == null ? '' : String(Math.round(cents / 100))
}

function pct(score: number): number {
  return Math.round(Math.min(1, Math.max(0, score)) * 100)
}

function FitChips({ chips }: { chips: string[] }) {
  if (chips.length === 0) return null
  return (
    <span className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <span
          key={c}
          className="rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-xs text-subtle"
        >
          {c}
        </span>
      ))}
    </span>
  )
}

export default async function RoommatesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/housing/roommates')

  const { tab } = await searchParams
  const activeTab: 'rooms' | 'people' = tab === 'people' ? 'people' : 'rooms'

  const seeker = await getSeekerProfile(profileId)
  const supabase = await createClient()
  // The authed client carries the caller's JWT so the consent-gated RPCs resolve auth.uid().
  // Cast to the loose shapes the matchers expect (the generated client over-narrows args).
  const [matches, people] = await Promise.all([
    matchRoommates(supabase as unknown as Parameters<typeof matchRoommates>[0], 12).catch(() => []),
    matchRoommateSeekers(supabase as unknown as Parameters<typeof matchRoommateSeekers>[0], 12).catch(() => []),
  ])

  const base = '/housing/roommates'

  return (
    <IndexTemplate
      title="Roommate matches"
      description="Tell us what you're after. We rank rooms and people by who you'd actually click with, your budget, and how close it is."
      toolbar={<MarketplaceFacets active="housing" />}
    >
      <SeekerForm
        initial={{
          active: seeker?.active ?? true,
          budgetMin: dollars(seeker?.budgetMinCents ?? null),
          budgetMax: dollars(seeker?.budgetMaxCents ?? null),
          moveIn: seeker?.moveInFrom ?? '',
          city: seeker?.searchCity ?? '',
          lat: seeker?.searchLat ?? null,
          lng: seeker?.searchLng ?? null,
          radiusMiles: seeker ? Math.round(seeker.searchRadiusM / 1609.344) : 25,
          // Prefill the lifestyle block from the stored preferences so a re-save
          // keeps what the member already told us (the v2 wipe bug).
          lifestyle: seekerPreferencesToLifestyle(seeker?.preferences),
        }}
      />

      {/* The one tab vocabulary (UnderlineTabs), ?tab=-driven like the profile page. */}
      <div className="mb-4">
        <UnderlineTabs
          activeHref={activeTab === 'people' ? `${base}?tab=people` : base}
          tabs={[
            { href: base, label: 'Rooms', count: matches.length },
            { href: `${base}?tab=people`, label: 'People', count: people.length },
          ]}
        />
      </div>

      {activeTab === 'rooms' &&
        (matches.length === 0 ? (
          <EmptyState
            icon={Users}
            variant="no-results"
            title="No room matches yet."
            description="Save your preferences above, then turn on Resonance matching so we can compare you with roommate hosts. Matches are private to you."
            action={
              <Link
                href="/settings/connections"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
              >
                <Sparkles className="h-4 w-4" aria-hidden /> Turn on Resonance matching
              </Link>
            }
          />
        ) : (
          <div className="@container">
            <div className="grid grid-cols-1 gap-4 @lg:grid-cols-2">
              {matches.map((m) => {
                const chips = fitChips(m.fits, { city: m.city })
                return (
                  <Link
                    key={m.listingId}
                    href={`/housing/${m.listingId}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 lift-1 transition-colors hover:border-primary/60"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 font-medium text-text">
                        <Sparkles className="h-4 w-4 text-primary" aria-hidden />
                        {pct(m.score)}% match
                      </p>
                      <p className="mt-0.5 flex items-center gap-2 text-sm text-subtle">
                        {m.city && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {m.city}
                          </span>
                        )}
                        {m.rentCents != null && <span>${Math.round(m.rentCents / 100)}/mo</span>}
                      </p>
                      {chips.length > 0 && (
                        <div className="mt-2">
                          <FitChips chips={chips} />
                        </div>
                      )}
                    </div>
                    <span className="shrink-0 text-sm font-medium text-primary">View</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}

      {activeTab === 'people' &&
        (people.length === 0 ? (
          <EmptyState
            icon={Users}
            variant="no-results"
            title="No people matches yet."
            description="Save your preferences above and stay marked as looking. Other members searching for roommates show up here once they opt in to Resonance matching too."
            action={
              <Link
                href="/settings/connections"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
              >
                <Sparkles className="h-4 w-4" aria-hidden /> Turn on Resonance matching
              </Link>
            }
          />
        ) : (
          <div className="@container">
            <div className="grid grid-cols-1 gap-4 @lg:grid-cols-2">
              {people.map((m) => (
                <PersonCard
                  key={m.profileId}
                  handle={m.handle}
                  displayName={m.displayName}
                  avatarUrl={m.avatarUrl}
                  context={
                    <span className="inline-flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
                      {pct(m.score)}% match
                      {m.city && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" aria-hidden />
                          {m.city}
                        </span>
                      )}
                    </span>
                  }
                  meta={<FitChips chips={fitChips(m.fits, { city: m.city })} />}
                />
              ))}
            </div>
          </div>
        ))}
    </IndexTemplate>
  )
}
