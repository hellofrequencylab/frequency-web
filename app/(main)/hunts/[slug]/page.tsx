import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Check, Flag, Gift, MapPin } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { FocusTemplate } from '@/components/templates'
import { getPublicHunt, visitedStops } from '@/lib/loyalty/hunt-store'
import { loyaltyEnabled } from '@/lib/loyalty/store'
import { HUNT_COMPLETE_ZAPS, huntLine, huntWindow } from '@/lib/loyalty/hunts'
import { formatRewardValue } from '@/lib/loyalty/program'

export const dynamic = 'force-dynamic'

// THE HUNT PAGE (LIVE-941, docs/LOYALTY.md): the route a host shares. Every stop, the window, the finish
// reward, and the viewer's own progress when signed in. Public (a hunt exists to be passed around), but
// noindex until discovery lands in LIVE-943. A draft 404s like a missing hunt. No em dashes.

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const hunt = loyaltyEnabled() ? await getPublicHunt(slug) : null
  return { title: hunt ? hunt.title : 'Hunt', robots: { index: false } }
}

export default async function HuntPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!loyaltyEnabled()) notFound()
  const hunt = await getPublicHunt(slug)
  if (!hunt) notFound()
  const profileId = await getMyProfileId()
  const visited = profileId ? await visitedStops(hunt, profileId) : new Set<string>()
  const stops = hunt.stops.filter((s) => s.status === 'accepted')
  const done = stops.filter((s) => visited.has(s.spaceId)).length
  const value = formatRewardValue(hunt.rewardValueCents)
  const over = hunt.status === 'ended'

  return (
    <FocusTemplate
      eyebrow={`A hunt hosted by ${hunt.hostSpaceName}`}
      title={hunt.title}
      description={hunt.description ?? `Check in at every stop between ${huntWindow(hunt.startsOn, hunt.endsOn)} to earn the reward.`}
      width="default"
    >
      <div className="space-y-6">
        <div className="rounded-card border border-border bg-surface p-4 lift-1">
          <p className="flex items-center gap-2 text-body font-semibold text-text">
            <Gift className="h-4 w-4 text-primary" aria-hidden />
            Finish every stop: {hunt.rewardTitle}
            {value ? <span className="font-normal text-muted">({value} value)</span> : null}
          </p>
          <p className="mt-1 text-body-sm text-muted">
            {over ? 'This hunt has ended.' : `${huntWindow(hunt.startsOn, hunt.endsOn)}. Each check-in also stamps that Space's card and pays 25 Zaps; finishing pays ${HUNT_COMPLETE_ZAPS} more.`}
            {hunt.rewardNote ? ` ${hunt.rewardNote}` : ''}
          </p>
          {profileId && (
            <p className="mt-2 flex items-center gap-1.5 text-body-sm font-semibold text-text">
              <Flag className="h-4 w-4" aria-hidden />
              {huntLine({ stopsDone: done, stopsTotal: stops.length, completed: stops.length > 0 && done >= stops.length })}
            </p>
          )}
        </div>

        <ol className="space-y-2">
          {stops.map((s, i) => {
            const got = visited.has(s.spaceId)
            return (
              <li key={s.spaceId} className="flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-pill border text-body-sm font-bold ${
                    got ? 'border-primary bg-primary text-on-primary' : 'border-border bg-surface-elevated text-subtle'
                  }`}
                  aria-hidden
                >
                  {got ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <Link href={`/spaces/${s.spaceSlug}`} className="block truncate text-body font-semibold text-text hover:underline">
                    {s.spaceName}
                  </Link>
                  <p className="text-meta text-muted">{s.host ? 'Host. Collect the reward here.' : got ? 'Checked in' : 'Check in at the door code'}</p>
                </div>
                <MapPin className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
              </li>
            )
          })}
        </ol>

        {!profileId && (
          <p className="text-body-sm text-muted">
            <Link href="/sign-in" className="font-semibold text-primary hover:underline">
              Sign in
            </Link>{' '}
            to see your progress. Check in at each stop with its door code and the hunt counts it.
          </p>
        )}
      </div>
    </FocusTemplate>
  )
}
