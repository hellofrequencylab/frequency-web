import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Users, MapPin, Sparkles } from 'lucide-react'
import { IndexTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import { getMyProfileId } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getSeekerProfile, matchRoommates } from '@/lib/listings/housing'
import { MarketplaceFacets } from '@/components/marketplace/facet-nav'
import { saveSeekerProfileAction } from '../../actions'

// Roommate matching — the seeker half. A member says what they're looking for; the
// consent-gated resonance RPC ranks roommate listings by member-to-member compatibility
// + budget fit + coarse geo. Coordinates never leave the DB; we show a match score only.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Roommate matches' }

const FIELD =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary'
const LABEL = 'mb-1 block text-sm font-medium text-text'

function dollars(cents: number | null): string {
  return cents == null ? '' : String(Math.round(cents / 100))
}

export default async function RoommatesPage() {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/marketplace/housing/roommates')

  const seeker = await getSeekerProfile(profileId)
  const supabase = await createClient()
  // The authed client carries the caller's JWT so the consent-gated RPC resolves auth.uid().
  // Cast to the loose rpc shape matchRoommates expects (the generated client over-narrows args).
  const matches = await matchRoommates(supabase as unknown as Parameters<typeof matchRoommates>[0], 12).catch(() => [])

  return (
    <IndexTemplate
      title="Roommate matches"
      description="Tell us what you're after. We rank roommate listings by who you'd actually click with, your budget, and how close it is."
      toolbar={<MarketplaceFacets active="housing" />}
    >
      <form
        action={saveSeekerProfileAction}
        className="mb-8 space-y-5 rounded-2xl border border-border bg-surface p-5 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="budget_min" className={LABEL}>
              Budget min (per month)
            </label>
            <input
              id="budget_min"
              name="budget_min"
              type="number"
              min="0"
              defaultValue={dollars(seeker?.budgetMinCents ?? null)}
              className={FIELD}
              placeholder="e.g. 600"
            />
          </div>
          <div>
            <label htmlFor="budget_max" className={LABEL}>
              Budget max (per month)
            </label>
            <input
              id="budget_max"
              name="budget_max"
              type="number"
              min="0"
              defaultValue={dollars(seeker?.budgetMaxCents ?? null)}
              className={FIELD}
              placeholder="e.g. 1200"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="city" className={LABEL}>
              City
            </label>
            <input id="city" name="city" defaultValue={seeker?.searchCity ?? ''} className={FIELD} placeholder="Where do you want to live?" />
          </div>
          <div>
            <label htmlFor="move_in" className={LABEL}>
              Move-in from
            </label>
            <input id="move_in" name="move_in" type="date" defaultValue={seeker?.moveInFrom ?? ''} className={FIELD} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" name="active" defaultChecked={seeker?.active ?? true} className="h-4 w-4 rounded border-border" />
          Show me as actively looking
        </label>
        <div className="flex justify-end">
          <button type="submit" className={buttonClasses('primary', 'md')}>
            Save and refresh matches
          </button>
        </div>
      </form>

      {matches.length === 0 ? (
        <EmptyState
          icon={Users}
          variant="no-results"
          title="No matches yet."
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
            {matches.map((m) => (
              <Link
                key={m.listingId}
                href={`/marketplace/housing/${m.listingId}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-primary/60"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-medium text-text">
                    <Sparkles className="h-4 w-4 text-primary" aria-hidden />
                    {Math.round(Math.min(1, Math.max(0, m.score)) * 100)}% match
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
                </div>
                <span className="shrink-0 text-sm font-medium text-primary">View</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </IndexTemplate>
  )
}
