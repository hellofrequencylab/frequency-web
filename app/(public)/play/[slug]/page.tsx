import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { ClaimStopForm } from '@/components/hunts/claim-stop-form'
import { DetailTemplate } from '@/components/templates/detail-template'
import { Button, buttonClasses } from '@/components/ui/button'
import { getMyProfileId } from '@/lib/auth'
import { loadScanPlacement, openClaim } from '@/lib/hunts/claim-store'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { isCrawler } from '@/lib/hunts/placement'
import { HELD_VISIT_MESSAGE } from '@/lib/hunts/player'
import { loadPublicTrailSummary } from '@/lib/hunts/run-store'
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

  const claim = await openClaim(profileId, placement.id, Math.floor(Date.now() / 1000))
  return claim.ok ? { action: `/hunts/p/${encodeURIComponent(code)}`, token: claim.token } : null
}

function claimFeedback(result: string | string[] | undefined): string | undefined {
  switch (result) {
    case 'credited': return 'Stop confirmed.'
    case 'already_credited': return 'You already confirmed this stop.'
    case 'held': return HELD_VISIT_MESSAGE
    case 'unavailable': return 'This stop could not be confirmed.'
    // FH-042S: a Mystery stop. The answer form below takes it from here.
    case 'answer': return 'This stop is a Mystery. Type your answer to confirm it.'
    case 'answer_locked': return 'That was your last try on this Mystery. The Trail has another way on, so open it to keep going.'
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

  // FH-042S: a Mystery answer goes through the same form as the Trail page, with the scanned code kept.
  const answering = Boolean(confirmation) && claim === 'answer' && typeof code === 'string'
  const feedback = profileId && (!confirmation || answering) ? claimFeedback(claim) : undefined
  const hero = await resolveDetailHero(`/play/${encodeURIComponent(trail.slug)}`)
  const playPath = `/hunts/${encodeURIComponent(trail.slug)}/play`
  return (
    <div className="wrap">
      <div className="py-8 sm:py-12">
        <DetailTemplate {...hero} title={trail.title} subtitle={trail.description}>
          <div className="space-y-4">
            <p className="text-body text-muted">{trail.stopCount} {trail.stopCount === 1 ? 'stop' : 'stops'}</p>
            {feedback && <p className="text-body" role="status">{feedback}</p>}
            {answering && typeof code === 'string' ? (
              <ClaimStopForm slug={trail.slug} code={code} mystery />
            ) : confirmation ? (
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
