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
import { loadPublicTrailSummary } from '@/lib/hunts/run-store'

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
    openGraph: { title, description },
    robots: { index: false, follow: false },
    referrer: 'strict-origin',
  }
}

async function loadConfirmation(profileId: string, slug: string, code: string | string[] | undefined) {
  if (!huntSwitchOn('claims') || typeof code !== 'string' || !code) return null
  const placement = await loadScanPlacement({ code })
  if (!placement || placement.revokedAt !== null || placement.huntSlug !== slug) return null

  const claim = await openClaim(profileId, placement.id, Math.floor(Date.now() / 1000))
  return claim.ok ? { action: `/hunts/p/${encodeURIComponent(code)}`, token: claim.token } : null
}

function claimFeedback(result: string | string[] | undefined): string | undefined {
  switch (result) {
    case 'credited': return 'Stop confirmed.'
    case 'already_credited': return 'You already confirmed this stop.'
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
  const playPath = `/hunts/${encodeURIComponent(trail.slug)}/play`
  return (
    <div className="wrap">
      <div className="py-8 sm:py-12">
        <DetailTemplate title={trail.title} subtitle={trail.description}>
          <div className="space-y-4">
            <p className="text-body text-muted">{trail.stopCount} {trail.stopCount === 1 ? 'stop' : 'stops'}</p>
            {feedback && <p className="text-body" role="status">{feedback}</p>}
            {confirmation ? (
              <form method="post" action={confirmation.action}>
                <input type="hidden" name="token" value={confirmation.token} />
                <Button type="submit">Confirm stop</Button>
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
