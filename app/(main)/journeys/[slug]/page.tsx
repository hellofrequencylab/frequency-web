import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { Globe, Lock, Link2, Pencil, Sparkles, Flame, Layers, SlidersHorizontal, Tag } from 'lucide-react'
import { JourneyDetailTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { OpenAdminBarButton } from '@/components/admin/open-admin-bar-button'
import { ShareImageProvider } from '@/components/qr/share-image-context'
import { QrShareDropdown } from '@/components/qr/qr-share-dropdown'
import { getCallerProfile } from '@/lib/auth'
import { getJourneyCapabilities } from '@/lib/core/load-capabilities'
import { getJourneyView, getPlan, getPlanAuthor } from '@/lib/journey-plans'
import { getPillars, pillarsById as indexPillars } from '@/lib/pillars'
import { accentColor, accentTint } from '@/lib/studio/accents'
import { JOURNEY_ICON_MAP, DefaultJourneyIcon } from '@/lib/studio/journey-icons'
import { adoptPlanAction, forkPlanAction } from '../actions'
import { enabledWidgets } from '@/lib/journey-page-config'
import { resolveDetailHero } from '@/lib/layout/detail-hero'
import { getJourneyOffer, seatLine, isSoldOut } from '@/lib/journeys/paid'
import { BuyButton } from '../../marketplace/buy-button'
import {
  StoryBlock,
  OutcomesBlock,
  PathBlock,
  PillarBalanceBlock,
  InstructorBlock,
  JourneyFaq,
  JourneyStatChips,
  AtAGlanceCard,
  journeyFacts,
  primaryPillar,
} from '@/components/journey/discovery-widgets'

export const dynamic = 'force-dynamic'


// The one Journey sales page (ADR-1402). Drafts open in the editor. Published Journeys stay
// here as the pitch and the till. Enrolled learners (not the author) go to /learn, which is
// the course. Voice is v2 (Run / Phase / enroll), no em dashes.

const VISIBILITY = {
  public: { Icon: Globe, label: 'Public' },
  unlisted: { Icon: Link2, label: 'Unlisted' },
  private: { Icon: Lock, label: 'Private' },
} as const

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
  //    the sales page (ADR-1402). Sending the author to /learn hid the till from the only person
  //    who can set a price, and made the course look like the public face of the offer.
  if (isAuthor && !preview && plan.visibility === 'private') {
    redirect(`/journeys/${plan.slug}/edit`)
  }

  const [pillars, author] = await Promise.all([getPillars(), getPlanAuthor(plan.author_id)])
  const byId = indexPillars(pillars)
  const vis = VISIBILITY[plan.visibility]
  const accent = plan.accent
  const PlanIcon = JOURNEY_ICON_MAP[plan.emoji ?? ''] ?? DefaultJourneyIcon

  // ACTIVE → the lesson player. An enrolled learner goes to /learn. An author stays on the pitch
  // so they can sell; they reach the course with Continue. `?preview=1` keeps an enrolled member
  // on the sales page when they asked to see it.
  if (adopted && !preview && !isAuthor) redirect(`/journeys/${plan.slug}/learn`)

  // Derive the at-a-glance facts ONCE; the header chips, the path accordion, and the rail
  // "what's included" list all read from this (so the numbers can never drift).
  const facts = journeyFacts(items)
  const topPillar = primaryPillar(items, byId)
  const canStart = facts.lessonCount > 0

  // Which discovery widgets the author enabled (still honours page_config order/toggles for
  // the optional blocks: story, pillar balance, social proof are opt-out-able).
  const enabled = new Set(enabledWidgets(plan.page_config, 'discovery').map((w) => w.id))

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
  // 🔴 `entryPoint="marketplace"` IS PRESERVATION, NOT A NEW CLASSIFICATION. The buyer who lands
  // here today completes the sale on `/market/<id>`, which passes it (LIVE-219), so omitting it
  // would silently reclassify that same sale `self` and drop the platform's cut to 0% as a side
  // effect of moving a button. `classifyOrderSource` still runs the self-scan and the ADR-913
  // relationship check ABOVE this, so an existing follower or member is still 0%.
  const buyControl = offer ? (
    <BuyButton
      productId={offer.productId}
      entryPoint="marketplace"
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
  // The identity band's chrome through the ONE resolver (PROG-P5, ADR-1136): the Journey's own
  // cover + focal point is rung 1, the operator's /journeys Settings image stands behind it, and
  // variant/height/overlay still resolve through the header element exactly as before.
  const oStyle = plan.header_overlay_style
  const hero = await resolveDetailHero(`/journeys/${plan.slug}`, {
    entityImage: plan.cover_image,
    entityFocus: plan.cover_focus,
    // The AUTHOR'S stored overlay choice still wins, through the option the standard-cover resolver
    // has for exactly this (the Circle None/Shade/Blend idiom). Only none/shadow/fade are honoured;
    // anything else falls back to the header element's registry default, as before.
    entityOverlayStyle: oStyle === 'none' || oStyle === 'shadow' || oStyle === 'fade' ? oStyle : null,
  })
  const page = (
    <JourneyDetailTemplate
      {...hero}
      title={
        <span className="inline-flex items-center gap-3 align-middle">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card"
            style={{ backgroundColor: accentTint(accent, 16), color: accentColor(accent) }}
          >
            <PlanIcon className="h-6 w-6" />
          </span>
          <span className="min-w-0 break-words">{plan.title}</span>
        </span>
      }
      badges={
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {plan.official && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-primary-bg px-2 py-0.5 text-meta font-semibold text-primary-strong">
              <Sparkles className="h-3 w-3" /> Official
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-pill bg-surface-elevated px-2 py-0.5 text-meta font-medium text-muted">
            <vis.Icon className="h-3 w-3" /> {vis.label}
          </span>
          {topPillar && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-primary-bg px-2 py-0.5 text-meta font-medium text-primary-strong">
              {topPillar.name}
            </span>
          )}
        </span>
      }
      actions={
        <>
          {canManageJourney && (
            <OpenAdminBarButton
              scope={{ kind: 'journey', id: plan.id }}
              caps={Array.from(journeyCaps)}
              label="Manage"
              icon={<SlidersHorizontal className="h-4 w-4" />}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-body-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text"
            />
          )}
          {canManageJourney && (
            <OpenAdminBarButton
              scope={{ kind: 'journey', id: plan.id }}
              caps={Array.from(journeyCaps)}
              label={offer ? `${offer.priceLabel}${offer.seatLine ? ` · ${offer.seatLine}` : ''}` : 'Set a price'}
              icon={<Tag className="h-4 w-4" />}
              className={
                offer
                  ? 'inline-flex items-center gap-1.5 rounded-lg border border-success/40 bg-success-bg px-3 py-1.5 text-body-sm font-semibold text-success transition-colors hover:bg-success-bg/70'
                  : 'inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-body-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text'
              }
            />
          )}
          <QrShareDropdown manager={canManageJourney} />
        </>
      }
      identity={{
        promise: plan.summary ? <p className="leading-relaxed text-text">{plan.summary}</p> : undefined,
        shape: <JourneyStatChips facts={facts} plan={plan} enrolledCount={plan.adopt_count} />,
        guide: author ? (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta">
            <Link href={`/people/${author.handle}`} className="text-muted transition-colors hover:text-text">
              By <span className="font-semibold text-text">{author.displayName}</span>
            </Link>
            <Link href="/crew" className="inline-flex items-center gap-1 text-muted transition-colors hover:text-text">
              <Flame className="h-3.5 w-3.5" /> Keep your streak in the Quest
            </Link>
            <a href="#the-path" className="inline-flex items-center gap-1 text-muted transition-colors hover:text-text">
              <Layers className="h-3.5 w-3.5" /> The path
            </a>
          </span>
        ) : undefined,
      }}
      notices={
        isAuthor && preview ? (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-2.5">
            <span className="text-body-sm text-muted">Preview. How others see your Journey.</span>
            <Link
              href={`/journeys/${plan.slug}/edit`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
            >
              <Pencil className="h-3.5 w-3.5" /> Back to editing
            </Link>
          </div>
        ) : undefined
      }
      interiorSide={
        // 🔴 ONE enrol control on this page, and it lives here (ADR-1401, amending ADR-1396 §4).
        // There used to be THREE — hero, rail and repeat card — each rendering an EnrollCta, which
        // since ADR-1400 means each mounting its own Stripe checkout island on a priced Journey.
        // The cover was the wrong home for it the moment it stopped being a link: card fields
        // cannot open inside a hero action row, which is what the HERO_CTA_WRAP !important override
        // existed to paper over. In the side column it is a full-width box, and `order-first` puts
        // it above the sales copy on a phone anyway, which is where the ruling wanted it.
        <div id="enrol" className="scroll-mt-6">
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
          />
        </div>
      }
      interiorMain={
        <div className="max-w-2xl space-y-8">
          {enabled.has('story') && <StoryBlock intro={plan.intro} />}
          <OutcomesBlock summary={plan.summary} />
          <div id="the-path" className="scroll-mt-6">
            {/* `pillarsById` is deliberately NOT passed: PathBlock declares the prop and never
                reads it. Both Journey pages were handing it over for nothing. */}
            <PathBlock items={items} accent={accent} facts={facts} dripIntervalDays={plan.drip_interval_days} />
          </div>
          {enabled.has('pillar-balance') && <PillarBalanceBlock items={items} pillars={pillars} />}
          <InstructorBlock author={author} />
          <JourneyFaq plan={plan} />

          {/* The repeat CTA closes the page. It is an ANCHOR to the one enrol box, never a second
              copy of it: a repeat CTA on a long sales page is worth having, a second mounted
              checkout is not. */}
          {!isAuthor && (
            <div className="rounded-card border border-border bg-surface p-5 lift-1">
              <p className="mb-3 text-body-sm font-semibold text-text">
                Start it solo, or run it with your Circle.
              </p>
              <a href="#enrol" className={buttonClasses('primary', 'md')}>
                {offer ? `Get access · ${offer.priceLabel}` : 'Start this Journey'}
              </a>
            </div>
          )}
        </div>
      }
    />
  )

  return (
    <>
      <ShareImageProvider imageUrl={plan.cover_image ?? null}>{page}</ShareImageProvider>
    </>
  )
}
