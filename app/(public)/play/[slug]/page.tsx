import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { DetailTemplate } from '@/components/templates/detail-template'
import { Button, buttonClasses } from '@/components/ui/button'
import { getMyProfileId } from '@/lib/auth'
import { loadScanPlacement, openClaim } from '@/lib/hunts/claim-store'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { isCrawler } from '@/lib/hunts/placement'
import { HELD_VISIT_MESSAGE } from '@/lib/hunts/player'
import { loadPublicTrailSummary } from '@/lib/hunts/run-store'
import { openTeamClaim } from '@/lib/hunts/team-store'
import { teamMessage } from '@/lib/hunts/teams'
import { resolveDetailHero } from '@/lib/layout/detail-hero'
import { OG_SITE, ROOT_OG_IMAGES } from '@/lib/site'

// This route can render a run-bound claim token. Next must render it per request.
export const dynamic = 'force-dynamic'

type TrailLandingProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ p?: string | string[]; claim?: string | string[] }>
}

const getTrail = cache(async (slug: string) =>
  huntSwitchOn('enabled') ? loadPublicTrailSummary(slug) : null,
)

export async function generateMetadata({ params }: Pick<TrailLandingProps, 'params'>): Promise<Metadata> {
  const { slug } = await params
  const trail = await getTrail(slug)
  const title = trail?.title ?? 'Trail'
  const description = trail?.description ?? undefined

  return {
    title,
    description,
    openGraph: { ...OG_SITE, title, description, images: ROOT_OG_IMAGES },
    robots: { index: false, follow: false },
    referrer: 'strict-origin',
  }
}

async function loadConfirmation(profileId: string, slug: string, code: string | string[] | undefined) {
  if (!huntSwitchOn('claims') || typeof code !== 'string' || !code) return null
  const placement = await loadScanPlacement({ code })
  if (!placement || placement.revokedAt !== null || placement.huntSlug !== slug) return null

  const action = `/hunts/p/${encodeURIComponent(code)}`
  const now = Math.floor(Date.now() / 1000)
  // FH-043S: a member of a locked Expedition team confirms for the team's run, not their own.
  const team = await openTeamClaim(profileId, code, now)
  if (team) return { action, token: team.token, forTeam: true }
  const claim = await openClaim(profileId, placement.id, now)
  return claim.ok ? { action, token: claim.token, forTeam: false } : null
}

function claimFeedback(result: string | string[] | undefined): string | undefined {
  switch (result) {
    case 'credited': return 'Stop confirmed.'
    case 'already_credited': return 'You already confirmed this stop.'
    case 'held': return HELD_VISIT_MESSAGE
    case 'team_credited': return teamMessage('credited')
    case 'team_already_credited': return teamMessage('already_credited')
    case 'team_not_locked': return teamMessage('roster_not_locked')
    case 'unavailable': return 'This stop could not be confirmed.'
  }
}

export default async function TrailLanding({ params, searchParams }: TrailLandingProps) {
  const { slug } = await params
  const trail = await getTrail(slug)
  if (!trail) notFound()

  const crawler = isCrawler((await headers()).get('user-agent'))
  const profileId = crawler ? null : await getMyProfileId()
  const { p: code, claim } = await searchParams
  const confirmation = profileId ? await loadConfirmation(profileId, trail.slug, code) : null

  const feedback = profileId && !confirmation ? claimFeedback(claim) : undefined
  const hero = await resolveDetailHero(`/play/${encodeURIComponent(trail.slug)}`)
  const playPath = `/hunts/${encodeURIComponent(trail.slug)}/play`
  return (
    <div className="wrap">
      <div className="py-8 sm:py-12">
        <DetailTemplate {...hero} title={trail.title} subtitle={trail.description}>
          <div className="space-y-4">
            <p className="text-body text-muted">{trail.stopCount} {trail.stopCount === 1 ? 'stop' : 'stops'}</p>
            {feedback && <p className="text-body" role="status">{feedback}</p>}
            {confirmation ? (
              <form method="post" action={confirmation.action}>
                <input type="hidden" name="token" value={confirmation.token} />
                <Button type="submit">{confirmation.forTeam ? 'Confirm stop for your team' : 'Confirm stop'}</Button>
              </form>
            ) : (
              <Link
                href={profileId ? playPath : { pathname: '/sign-in', query: { next: playPath } }}
                prefetch={false}
                className={buttonClasses()}
              >
                {profileId ? 'Play the Trail' : 'Sign in to play'}
              </Link>
            )}
          </div>
        </DetailTemplate>
      </div>
    </div>
  )
}
