import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, spaceCanUseFullWebsite } from '@/lib/spaces/entitlements'
import { isConsoleSpaceType } from '@/lib/spaces/types'
import { ConsoleFocusTemplate } from '@/components/templates/console-templates'
import { Button } from '@/components/ui/button'
import { consoleBack } from '@/lib/spaces/console-back'
import { OFFER_PAGE_SLUG, firstOfferSeed, offerPageCount } from '@/lib/launch/offer-page'
import { startOfferPageAction } from './actions'

// THE ONE-OFFER PAGE STARTER (LIVE-1938). The Setup item "Publish a page for one offer" opens here. The page is made from the
// Space's own first offering and opens in the same page editor as every other Space page; nothing about it is a separate
// builder. An existing offer page goes straight to the editor. Gated like the Page settings: a manager only, notFound for the rest.

export const metadata: Metadata = {
  title: 'Offer page',
  description: 'Make a page that sells one offer.',
  robots: { index: false, follow: false },
}

export default async function OfferPageStarter({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ e?: string }> }) {
  const { slug } = await params
  const { e } = await searchParams
  const caller = await getCallerProfile()
  const space = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  if (!space) notFound()
  const { canManage } = await resolveSpaceManageAccess(space, caller?.id ?? null, caller?.webRole)
  if (!canManage || !isConsoleSpaceType(space.type)) notFound()

  const editor = `/spaces/${slug}/edit-page?page=${OFFER_PAGE_SLUG}`
  if (offerPageCount(space.preferences) > 0) redirect(editor)

  const seed = firstOfferSeed(space.preferences)
  const locked = !spaceCanUseFullWebsite(space)
  return (
    <ConsoleFocusTemplate
      back={consoleBack(slug, 'settings')}
      eyebrow="Manage space"
      title="A page for one offer"
      description="One page that sells one thing: the pitch, the offer with its price, and a way to book."
      width="wide"
    >
      <section className="panel" style={{ display: 'grid', gap: 16 }}>
        {!seed ? (
          <>
            <h2 className="h2">List what you sell first</h2>
            <p className="t2">This page is made from your first product or service, so it starts with the right words and price.</p>
            <Link href={`/spaces/${slug}/settings/offerings`} className="btn pa">
              List a product or service
            </Link>
          </>
        ) : locked ? (
          <>
            <h2 className="h2">Extra pages come with your own website</h2>
            <p className="t2">Your website plan includes more pages. Once it is on, this page is made from {seed.title} in one tap.</p>
            <Link href={`/spaces/${slug}/settings/billing`} className="btn pa">
              See plans
            </Link>
          </>
        ) : (
          <form action={startOfferPageAction.bind(null, slug)} style={{ display: 'grid', gap: 16 }}>
            <h2 className="h2">{seed.title}</h2>
            <p className="t2">We will start the page from this offer, then open it in the editor so you can change anything.</p>
            {e === '1' ? <p className="t2">We could not make the page. Try again.</p> : null}
            <div>
              <Button type="submit">Make my offer page</Button>
            </div>
          </form>
        )}
      </section>
    </ConsoleFocusTemplate>
  )
}
