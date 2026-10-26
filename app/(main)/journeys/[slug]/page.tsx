import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { Pencil, SlidersHorizontal, Tag } from 'lucide-react'
import { OpenAdminBarButton } from '@/components/admin/open-admin-bar-button'
import { ShareImageProvider } from '@/modules/qr'
import { QrShareDropdown } from '@/modules/qr'
import { getCallerProfile, isPlatformStaff } from '@/lib/auth'
import { getJourneyCapabilities } from '@/lib/core/load-capabilities'
import { getJourneyView, getPlan, getPlanAuthor, listJourneyCoHostSpaces, getCompletedLessonIds, listPublicJourneys } from '@/lib/journey-plans'
import { JourneyBody } from '@/components/frequency/members/journey/journey-body'
import { listFriendsOnJourney } from '@/lib/journeys/friends-on-journey'
import { buildJourneyTree } from '@/lib/journeys/tree'
import { JourneyDock } from '@/components/journey/nav/journey-dock'
import { readJourneyOutcomes } from '@/lib/journeys/outcomes'
import { readJourneyGuarantee } from '@/lib/journeys/guarantee'
import { JourneyGuaranteeBlock } from '@/components/journey/guarantee-block'
import { adoptPlanAction, forkPlanAction } from '../actions'
import { getJourneyOffer, seatLine, isSoldOut, productIdsForJourneyPlan } from '@/lib/journeys/paid'
import { checkJourneyTier } from '@/lib/journeys/tier-gate'
import { BuyButton } from '../../marketplace/buy-button'
import { getProductReviews, getMyProductReview, hasPurchasedProduct } from '@/lib/commerce/reviews'
import { ProductReviews } from '@/components/marketplace/product-reviews'
import { getListingComments } from '@/lib/marketplace/listing-comments'
import { ListingQna } from '@/components/marketplace/listing-qna'
import type { ListingComment } from '@/lib/marketplace/listing-comments'
import { itemsToBlocks, OutcomesBlock, InstructorBlock, JourneyFaq, AtAGlanceCard, journeyFacts } from '@/components/journey/discovery-widgets'
import { OG_SITE } from '@/lib/site'
import { QuestSponsorRewards } from '@/components/quest/quest-sponsor-rewards'

export const dynamic = 'force-dynamic'


// The one Journey sales page (ADR-1404). Drafts open in the editor. Published Journeys stay
// here as the pitch and the till. Enrolled learners (not the author) go to /learn, which is
// the course. Voice is v2 (Run / Phase / enroll), no em dashes.


// Per-Journey metadata — a real title, summary, and share card for the tab, history, and any
// shared link (and ready for a public Journey route). Private plans stay generic.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const loaded = await getPlan(slug)
  // No ` · Frequency` suffix: the root layout's `title.template` appends it (app/layout.tsx).
  if (!loaded || loaded.plan.visibility === 'private') return { title: 'Journey' }
  const { plan } = loaded
  const title = plan.title
  const description =
    plan.summary ?? 'A guided set of phases to move through, on your own or with your Circle.'
  return {
    title,
    description,
    // This app-shell page twins the canonical /discover/journeys/<slug>; point the canonical
    // there so ranking signals consolidate on the discover surface rather than compete with it.
    alternates: { canonical: `/discover/journeys/${slug}` },
    openGraph: {
      ...OG_SITE,
      title: plan.title,
      description,
      type: 'article',
      ...(plan.cover_image ? { images: [{ url: plan.cover_image }] } : {}),
    },
    twitter: {
      card: plan.cover_image ? 'summary_large_image' : 'summary',
      title: plan.title,
      description,
    },
  }
}

export default async function JourneyPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ preview?: string }>
}) {
  const { slug } = await params
  const { preview } = await searchParams
  const caller = await getCallerProfile()
  const profileId = caller?.id ?? null

  // Single data load for the read-only page (the contract).
  const view = await getJourneyView(profileId, slug)
  if (!view) notFound()
  const { plan, items, adopted } = view

  const isAuthor = !!profileId && plan.author_id === profileId
  if (!isAuthor && plan.visibility === 'private') notFound()

  // ── AUTHOR. A DRAFT still opens in the editor. A published Journey stays on this page: it is
  //    the sales page (ADR-1404). Sending the author to /learn hid the till from the only person
  //    who can set a price, and made the course look like the public face of the offer.
  if (isAuthor && !preview && plan.visibility === 'private') {
    redirect(`/journeys/${plan.slug}/edit`)
  }

  // Co-host Spaces (journey_plan_space_shares, accepted only): a credit line, never edit access.
  const [author, coHosts] = await Promise.all([
    getPlanAuthor(plan.author_id),
    listJourneyCoHostSpaces(plan.id, plan.space_id),
  ])

  // ACTIVE → the lesson player. An enrolled learner goes to /learn. An author stays on the pitch
  // so they can sell; they reach the course with Continue. `?preview=1` keeps an enrolled member
  // on the sales page when they asked to see it.
  if (adopted && !preview && !isAuthor) redirect(`/journeys/${plan.slug}/learn`)

  // Derive the at-a-glance facts ONCE; the header chips, the path accordion, and the rail
  // "what's included" list all read from this (so the numbers can never drift).
  const facts = journeyFacts(items)
  const canStart = facts.lessonCount > 0

  // The Journey dock (About · Course · Focus · Library) is for someone who is IN this Journey: an
  // enrolled member reading the pitch again, or its author. A visitor gets the sales page alone.
  const docked = adopted || isAuthor

  // The standardized admin rail trigger, mirroring /learn (:183) so the scoped Journey rail is reachable
  // from the detail/root page too, not only the player. journey.editSettings resolves to the author,
  // platform staff, or a parent-scope manager (getJourneyCapabilities) — every module re-gates
  // server-side, so this is UX, never the authority. PageAdminBar suppresses its own generic cog on
  // /journeys/<slug> (isEntityDetail), so this is the single trigger here.
  const journeyCaps = await getJourneyCapabilities(plan.id)
  const canManageJourney = journeyCaps.has('journey.editSettings')

  // The sellable face of this Journey, when it has one (ADR-1397). Free Journeys read null and the
  // enrol control is exactly what it has always been.
  const rawOffer = await getJourneyOffer(plan.id)
  const lineageIds = await productIdsForJourneyPlan(plan.id)
  const reviewProductId = rawOffer?.productId ?? lineageIds[0] ?? null
  const [reviews, myReview, comments, operator, purchased] = reviewProductId
    ? await Promise.all([
        getProductReviews(reviewProductId),
        getMyProductReview(reviewProductId, profileId),
        getListingComments('product', reviewProductId),
        isPlatformStaff(),
        profileId ? hasPurchasedProduct(profileId, reviewProductId) : Promise.resolve(false),
      ])
    : [null, null, [] as ListingComment[], false, false]
  const offer = rawOffer
    ? {
        productId: rawOffer.productId,
        priceLabel: new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: (rawOffer.currency || 'usd').toUpperCase(),
          maximumFractionDigits: rawOffer.priceCents % 100 === 0 ? 0 : 2,
        }).format(rawOffer.priceCents / 100),
        seatLine: seatLine(rawOffer),
        soldOut: isSoldOut(rawOffer),
      }
    : null

  // ── THE TILL, ON THE PAGE THAT PITCHES (ADR-1400) ───────────────────────────────────────────────
  // This used to be a <Link> to `/market/<id>`: the member read the story, the curriculum and the
  // guide, pressed "Get access", and was navigated to a DIFFERENT page with a different header and
  // a second copy of the same body before they could see a card field. The card fields now open
  // under the button they pressed. Same `BuyButton`, same `createCommerceCheckout`, same embedded
  // panel -- only the mounting point moved, so there is still exactly one checkout.
  //
  // LIVE-220: proxy.ts stamps `/journeys/<slug>` as a discovery view. Checkout reads that
  // cookie, so this page must not pass a client entryPoint. classifyOrderSource still runs
  // the self-scan and the ADR-913 relationship check ABOVE the stamp, so an existing
  // follower or member is still 0%.
  const tierCheck = await checkJourneyTier(plan.id, profileId, { isOwner: isAuthor || canManageJourney })
  const tierGate = tierCheck.ok ? null : { reason: tierCheck.error, href: tierCheck.href }

  const buyControl = offer && !tierGate ? (
    <BuyButton
      productId={offer.productId}
      label={`Get access · ${offer.priceLabel}`}
      priceLabel={offer.priceLabel}
      doneTitle="You are in."
      doneBody={`You are enrolled in ${plan.title}. A receipt is on its way to your email.`}
      doneHref={`/journeys/${plan.slug}/learn`}
    />
  ) : null


  // The standardized `header` element (ADR-793), identity layout: the cover + Journey icon + title +
  // one-line summary overlaid immersively (the "liked" Business-page look), instead of the old plain
  // image band with the title stranded below it. The interactive meta (badges, author/streak/path links,
  // stat chips, enroll/manage) stays in the light `band` under the hero, so those controls keep their
  // normal styling and contrast. Layout + height resolve from the header element's master config
  // (/admin/elements), defaulting to identity/standard, so an operator can retune it without a deploy.
  // The author's picked overlay (journey_plans) is the surface default; an operator master value still
  // overrides site-wide. Only none/shadow/fade are honored; anything else falls back to the registry default.
  const completed = docked && profileId ? [...(await getCompletedLessonIds(profileId, plan.id))] : []
  const tree = buildJourneyTree(itemsToBlocks(items), completed)
  const [publicJourneys, friends] = await Promise.all([
    listPublicJourneys(),
    profileId ? listFriendsOnJourney(profileId, plan.id) : Promise.resolve([]),
  ])
  const more = publicJourneys
    .filter((j) => j.id !== plan.id)
    .slice(0, 3)
    .map((j) => ({ slug: j.slug, title: j.title, coverImage: j.cover_image, adoptCount: j.adopt_count }))
  const fqActions = (
    <>
      {canManageJourney && (
        <OpenAdminBarButton
          scope={{ kind: 'journey', id: plan.id }}
          caps={Array.from(journeyCaps)}
          label="Manage"
          icon={<SlidersHorizontal className="h-4 w-4" />}
          className="btn sm"
        />
      )}
      {canManageJourney && (
        <OpenAdminBarButton
          scope={{ kind: 'journey', id: plan.id }}
          caps={Array.from(journeyCaps)}
          label={offer ? `${offer.priceLabel}${offer.seatLine ? ` · ${offer.seatLine}` : ''}` : 'Set a price'}
          icon={<Tag className="h-4 w-4" />}
          className="btn sm"
        />
      )}
      <QrShareDropdown manager={canManageJourney} />
    </>
  )
  const credits =
    author || coHosts.length > 0 ? (
      <span className="stack mc-gap-6">
        {author && (
          <Link className="t2" href={`/people/${author.handle}`}>
            By {author.displayName}
          </Link>
        )}
        {coHosts.map((s) => (
          <Link key={s.id} className="t2" href={`/spaces/${s.slug}`}>
            Co-hosted with {s.name}
          </Link>
        ))}
      </span>
    ) : null
  return (
    <>
      <ShareImageProvider imageUrl={plan.cover_image ?? null}>
        <JourneyBody
          plan={{ slug: plan.slug, title: plan.title, summary: plan.summary, adoptCount: plan.adopt_count }}
          tree={tree}
          tracked={docked}
          inside={adopted || isAuthor}
          offerLabel={offer?.priceLabel ?? null}
          credits={credits}
          actions={fqActions}
          notice={
            isAuthor && preview ? (
              <div className="mc-note">
                <span className="t2">Preview. How others see your Journey.</span>
                <Link className="btn sm" href={`/journeys/${plan.slug}/edit`}>
                  <Pencil className="h-3.5 w-3.5" /> Back to editing
                </Link>
              </div>
            ) : null
          }
          enrol={
            <>
              <AtAGlanceCard
                plan={plan}
                slug={plan.slug}
                facts={facts}
                enrolled={adopted}
                canStart={canStart}
                isAuthor={isAuthor}
                progress={null}
                enrollAction={adoptPlanAction}
                forkAction={forkPlanAction}
                offer={offer}
                buyControl={buyControl}
                tierGate={tierGate}
              />
              {plan.official && plan.quest_id && <QuestSponsorRewards questId={plan.quest_id} profileId={profileId} />}
            </>
          }
          details={
            <>
              <OutcomesBlock outcomes={readJourneyOutcomes(plan.page_config)} />
              <InstructorBlock author={author} />
              {reviewProductId && reviews && (
                <ProductReviews
                  productId={reviewProductId}
                  productTitle={plan.title}
                  reviews={reviews}
                  myReview={myReview}
                  signedIn={!!profileId}
                  canReview={!!profileId && !!rawOffer && !canManageJourney && purchased}
                  canModerate={operator}
                />
              )}
              <JourneyFaq plan={plan} />
              {reviewProductId && (
                <ListingQna
                  targetKind="product"
                  targetId={reviewProductId}
                  revalidatePath={`/journeys/${plan.slug}`}
                  comments={comments}
                  canPost={!!profileId}
                  canModerate={canManageJourney || operator}
                  myProfileId={profileId}
                  isOwner={canManageJourney}
                />
              )}
              <JourneyGuaranteeBlock guarantee={readJourneyGuarantee(plan.page_config)} />
            </>
          }
          more={more}
          friends={friends}
        />
      </ShareImageProvider>
      {docked && (
        <JourneyDock slug={plan.slug} active="about" percent={tree.percent} aboutHref={isAuthor ? `/journeys/${plan.slug}` : undefined} />
      )}
    </>
  )
}
