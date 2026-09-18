// JourneyDetailTemplate — THE standard block layout for every page-like Journey surface.
//
// A COMPOSITION over DetailTemplate, not a twelfth shell (PAGE-FRAMEWORK §3 still has seven
// authoring shells + the kit). It wraps DetailTemplate — it never re-declares a header, an h1, a
// cover band, or the PageAdminBar hairline — and adds the three things DetailTemplate has no
// opinion about: the page frame (structured data, the notices region), the ORDER of the Journey
// identity stack, and the interior two-column geometry. This is the same contract
// EventDetailTemplate holds for events, and it is written to read as its sibling on purpose.
//
// ── WHY IT EXISTS ───────────────────────────────────────────────────────────────────────────────
//
// The two Journey surfaces had already forked, in the most literal way available: both hand-rolled
// the SAME interior grid around a raw DetailTemplate, byte for byte —
//
//   app/(main)/journeys/[slug]/page.tsx     <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8">
//   app/discover/journeys/[slug]/page.tsx   <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8">
//
// with matching rail and main wrappers. That is the copy-the-JSX failure EventDetailTemplate was
// extracted to stop, caught one surface before it became three.
//
// Server Component, no hooks, every slot a ReactNode the PAGE builds. That is deliberate: per
// node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md
// ("Reducing JS bundle size" / the `children` slot pattern) a server-rendered node passed as a prop
// is NOT pulled into the receiving component's module graph. So the member page may hand this
// template a Stripe checkout island without the template, or the public marketing route that also
// composes it, becoming client code.
//
// ── The contract ────────────────────────────────────────────────────────────────────────────────
// Differences between surfaces are expressed as an ABSENT SLOT, never as a fork. There is no
// `variant`, no `isPublic`, no `anonymous` branch in this file, and the drift guard
// (journey-standard-layout.test.ts) fails the build if one appears. The public page has no Manage
// button because it omits `actions` — not because the template knows who is looking.
//
// 🔴 THE TEMPLATE OWNS THE H1, VIA DetailTemplate's `title`. The member page used to get its h1
// from a PageHero identity lockup INSIDE the cover while the public page got it from
// DetailTemplate, so the two surfaces disagreed about what a Journey header even is. A shared
// template has to pick one, and this picks the events shape: a plain cover band, the title beneath
// it. That also follows ADR-1396, which moved entity headers off the overlaid-title treatment
// ("no overlay by default, the description under the image").

import type React from 'react'
import type { ReactNode } from 'react'
import { DetailTemplate } from './detail-template'

/** The identity region under the H1, in the ONE arrangement every Journey surface renders it.
 *  Naming each line (rather than taking one opaque `subtitle` blob) is what makes the shape itself
 *  the standard: a surface can leave a line out, but it cannot put the guide above the promise.
 *
 *  One full-width column, in three groups, in the order a reader asks:
 *
 *    the offer       promise · shape        what this is and what it costs you in time
 *    the gathering   meets · guide · belonging   where it happens and who runs it
 *    the reward      reward                 what finishing earns, a band by nature
 *
 *  The gap BETWEEN groups is wider than the gap inside one, so the stack reads as three things
 *  rather than six lines. An empty group renders nothing at all, so a self-paced Journey reads
 *  promise · shape with no hole where the meeting would have been.
 *
 *  The declaration order below IS the render order, and journey-standard-layout.test.ts pins the
 *  two together. */
export interface JourneyIdentitySlots {
  /** The one-line promise: what a member can do at the end. The key fact, rendered a step stronger. */
  promise?: ReactNode
  /** The shape of the work: phases, lessons, hours, cadence. */
  shape?: ReactNode
  /** Where and when it gathers, for a Journey that meets. Absent for a purely self-paced one. */
  meets?: ReactNode
  /** "By <author>" — who is teaching it. */
  guide?: ReactNode
  /** Where this Journey belongs: its Space, its Quest season. Page owns its own <Suspense>. */
  belonging?: ReactNode
  /** What finishing earns (Gems, a certificate). Header content, not a floating band. */
  reward?: ReactNode
  /**
   * THE OFFER COLUMN, BESIDE THE INFO RATHER THAN ABOVE IT — the direct analogue of the event
   * countdown's slot, and it exists for the same reason: DetailTemplate's `actions` column is
   * `sm:shrink-0`, so anything wide enough to hold a price and a seat line side by side steals that
   * width from the title and wraps it. Here the region is already full width, so a price can sit
   * beside the identity lines at its natural size and cost the title nothing.
   *
   * It self-suppresses, so a surface that passes nothing here is byte-identical to one that has no
   * offer at all — which is exactly what a free Journey is.
   */
  aside?: ReactNode
}

export interface JourneyDetailTemplateProps {
  // ── page frame ────────────────────────────────────────────────────────────────────────────────
  /** <JsonLd> for the HowTo / Offer / breadcrumb schemas. Rendered first, paints nothing. */
  structuredData?: ReactNode
  /** The banner region ABOVE the header: the author's preview notice, a sold-out notice. */
  notices?: ReactNode

  // ── header lockup (handed straight to DetailTemplate) ─────────────────────────────────────────
  /** The full-bleed cover band, as a node. A cover ALONE: the title lives under it, never on it
   *  (see the header note above). Wins over the four `cover*` props below, exactly the way
   *  DetailTemplate's own `hero` wins over its `coverImage` — same contract, one level up. */
  cover?: ReactNode
  /** The standard cover, resolved through `resolveDetailHero`. Both Journey surfaces take this
   *  path: the element is asked for the HEIGHT and the OVERLAY, and DetailTemplate renders it
   *  through PageHero's minimal variant with `heading={false}`, because the page's single <h1>
   *  lives in the band below. Spread the resolver's return straight in. */
  coverImage?: string | null
  coverFocus?: string | null
  coverSize?: React.ComponentProps<typeof DetailTemplate>['coverSize']
  coverOverlayStyle?: React.ComponentProps<typeof DetailTemplate>['coverOverlayStyle']
  /** The single back affordance. Never hand-roll a second one above the template. */
  back?: { href: string; label: string }
  /** The page's own breadcrumb trail. Handed straight to DetailTemplate; note that passing it does
   *  not by itself suppress the shell's generic trail — the route must also be listed in
   *  `ownsBreadcrumb` in lib/layout/page-chrome.ts, or the page renders two. */
  breadcrumb?: { href: string; label: string }[]
  title: ReactNode
  /** Status chips (Official · Unlisted · Private · the top Pillar).
   *
   *  These ride the TOP RIGHT OF THE COVER when there is one, the way an event's mode pill does:
   *  that corner is where a poster carries its own designation and where nothing else wants to be.
   *  A surface that fills no `cover` has nowhere to put them, so there they fall back to
   *  DetailTemplate's own slot beside the H1. That is a slot test, not a per-surface branch. */
  badges?: ReactNode
  /** The compact header action row (Share · Manage). NOT the enrol control: that belongs in the
   *  interior side column, where it can be the full-width box a buy control needs to be. */
  actions?: ReactNode
  /** A Journey page is a marquee destination, so the H1 leads at display scale by default. */
  titleScale?: 'default' | 'display'

  // ── identity ──────────────────────────────────────────────────────────────────────────────────
  identity?: JourneyIdentitySlots

  // ── body ──────────────────────────────────────────────────────────────────────────────────────
  /** A full-width band at the top of the interior, above the two columns. */
  bodyLead?: ReactNode
  /** The WHOLE interior, for a surface that wants to draw its own. */
  interior?: ReactNode
  /** Used INSTEAD of `interior`. Rendered through the SAME grid geometry, so two surfaces are the
   *  same shape by construction rather than by coincidence. */
  interiorMain?: ReactNode
  interiorSide?: ReactNode
}

// The interior geometry, using the exact class strings the module engine uses for its `main-side`
// template (components/widgets/page-modules.tsx) and that EventDetailTemplate's EventInterior uses:
// a 3:2 split from lg, with the SIDE column stacking ABOVE main on a phone so a buyer sees the
// price and the enrol control before the long sales copy.
//
// 🔴 THAT MOBILE ORDER IS WHY THERE IS NO STICKY BOTTOM BAR, and the reasoning is inherited rather
// than re-litigated: the events sticky action bar was removed on 2026-08-31 because the side column
// already puts the Join box first on a phone, and a fixed lane cost every page a reservation to say
// the same thing twice. A Journey is the same case.
//
// ⚠️ ONE DELIBERATE DIFFERENCE FROM EventInterior, and it is the only one: the side column's
// contents are wrapped in a sticky positioner on lg+. An event's side column is a short stack of
// facts beside a short body; a Journey's is a BUY BOX beside 3,000 words of sales copy, and a buy
// control that scrolls away is the one thing every piece of checkout research agrees about. The
// three pinned class strings are untouched, so the grid itself cannot drift from the module engine;
// only the inner wrapper is ours, and the drift guard asserts it is exactly this one extra div.
function JourneyInterior({ main, side }: { main?: ReactNode; side?: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-5 lg:gap-8">
      <div className="@container space-y-4 lg:col-span-3">{main}</div>
      <div className="@container order-first space-y-4 lg:order-none lg:col-span-2">
        <div className="lg:sticky lg:top-6">{side}</div>
      </div>
    </div>
  )
}

export function JourneyDetailTemplate({
  structuredData,
  notices,
  cover,
  coverImage,
  coverFocus,
  coverSize,
  coverOverlayStyle,
  back,
  breadcrumb,
  title,
  badges,
  actions,
  titleScale = 'display',
  identity = {},
  bodyLead,
  interior,
  interiorMain,
  interiorSide,
}: JourneyDetailTemplateProps) {
  const filled = (line: ReactNode) => line !== undefined && line !== null && line !== false
  const offer = [identity.promise, identity.shape]
  const gathering = [identity.meets, identity.guide, identity.belonging]
  const hasOffer = offer.some(filled)
  const hasGathering = gathering.some(filled)
  // A Journey with nothing to say under its title gets no region container at all, rather than an
  // empty div carrying the region's margin. Each GROUP self-suppresses the same way, so a
  // self-paced Journey has no empty gap where its meeting lines would have been.
  const hasIdentity = hasOffer || hasGathering || filled(identity.reward)

  // The info LINES, in the one arrangement every Journey surface renders them. Hoisted to a const
  // so the two `meta` shapes below (with an offer column, and without) render the SAME stack rather
  // than two copies that can drift apart.
  const identityStack = (
    <>
      {hasOffer && (
        <div className="space-y-1.5">
          {identity.promise}
          {identity.shape}
        </div>
      )}
      {hasGathering && (
        <div className="space-y-1.5">
          {identity.meets}
          {identity.guide}
          {identity.belonging}
        </div>
      )}
      {identity.reward}
    </>
  )

  return (
    <div>
      {structuredData}
      {notices}

      <DetailTemplate
        // THE STATUS CHIPS RIDE THE COVER, for the reason EventDetailTemplate gives: beside the H1
        // they read as a third thing competing with the title and the action row for one line. In
        // the cover's top-right corner nothing else wants to be. With no cover there is no corner,
        // so they go back to DetailTemplate's own slot — an absent slot, not a per-surface branch.
        hero={
          cover !== undefined && badges ? (
            <div className="relative">
              {cover}
              <div className="absolute right-3 top-3 flex max-w-[60%] flex-wrap justify-end gap-1.5 sm:right-4 sm:top-4">
                {badges}
              </div>
            </div>
          ) : (
            cover
          )
        }
        coverImage={coverImage}
        coverFocus={coverFocus}
        coverSize={coverSize}
        coverOverlayStyle={coverOverlayStyle}
        back={back}
        breadcrumb={breadcrumb}
        titleScale={titleScale}
        title={title}
        badges={cover !== undefined && badges ? undefined : badges}
        // THE FULL-WIDTH SLOT, NOT THE NARROW COLUMN. `subtitle` is squeezed beside the action
        // column for its whole height, which is what made the old hand-rolled bands read as a form.
        // `meta` is the full-width region DetailTemplate has always had for exactly this.
        meta={
          hasIdentity || filled(identity.aside) ? (
            filled(identity.aside) ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                <div className="min-w-0 flex-1 space-y-3 text-body-sm text-muted">{identityStack}</div>
                <div className="w-full sm:w-auto sm:shrink-0">{identity.aside}</div>
              </div>
            ) : (
              <div className="space-y-3 text-body-sm text-muted">{identityStack}</div>
            )
          ) : undefined
        }
        actions={actions}
      >
        {bodyLead}
        {interior ??
          (interiorMain !== undefined || interiorSide !== undefined ? (
            <JourneyInterior main={interiorMain} side={interiorSide} />
          ) : null)}
      </DetailTemplate>
    </div>
  )
}
