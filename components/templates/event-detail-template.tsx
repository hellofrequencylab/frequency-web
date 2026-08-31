// EventDetailTemplate — THE standard block layout for every page-like event surface.
//
// Owner directive (2026-07-28): "Make this block layout the standard for All events." The shape it
// names is the one the public event page already renders, and until now that shape lived nowhere:
// it was a DetailTemplate call plus ~340 lines of glue that only one file had. Any second event
// surface could only get the same page by copying it, which is how layouts fork.
//
// This is a COMPOSITION, not a tenth shell (PAGE-FRAMEWORK §3 still has five templates + the kit).
// It wraps DetailTemplate — it never re-declares a header, an h1, a cover band, or a divider — and
// adds the three things DetailTemplate has no opinion about: the page frame (bottom-bar padding,
// structured data, the banner region), the ORDER of the event identity stack, and the interior
// two-column geometry.
//
// Server Component, no hooks, every slot a ReactNode the PAGE builds. That is deliberate: per
// node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md
// ("Reducing JS bundle size" / the `children` slot pattern) a server-rendered node passed as a prop
// is NOT pulled into the receiving component's module graph. So a page may hand this template client
// islands (the gallery lightbox, the sticky RSVP bar, the inline title editor) without any of them,
// or the template itself, becoming client code.
//
// ── The contract ────────────────────────────────────────────────────────────────────────────────
// Differences between surfaces are expressed as an ABSENT SLOT, never as a fork. There is no
// `variant`, no `isPublic`, no `anonymous` branch in this file, and the drift guard
// (event-standard-layout.test.ts) fails the build if one appears. A public unauthenticated event has
// no operator actions and no RSVP bar because it omits `actions` and `actionBar` — not because the
// template knows who is looking.

import type { ReactNode } from 'react'
import { DetailTemplate } from './detail-template'

/** The identity stack under the H1, in the ONE order every event surface renders it.
 *  Naming each line (rather than taking one opaque `subtitle` blob) is what makes the shape itself
 *  the standard: a surface can leave a line out, but it cannot put "Hosted by" above the date. */
export interface EventIdentitySlots {
  /** The when-line. The key fact, rendered a step stronger than the rest of the stack. */
  when?: ReactNode
  /** The where-line: venue, address, map deep link. */
  where?: ReactNode
  /** "Repeats weekly" / "Part of a recurring series" (+ until). */
  cadence?: ReactNode
  /** "Next: …" for a recurring anchor whose own date has passed. */
  nextDate?: ReactNode
  /** The series date rail (ADR-897). */
  seriesRail?: ReactNode
  /** Where this event belongs: its Circle, Space, Journey. Page owns its own <Suspense>. */
  belonging?: ReactNode
  /** "Hosted by …" (+ collaborators, + organizer credit). */
  hostedBy?: ReactNode
  /** The posted-by credit line. */
  credit?: ReactNode
  /** The check-in reward line. Header content, not a floating band. */
  reward?: ReactNode
}

export interface EventDetailTemplateProps {
  // ── page frame ────────────────────────────────────────────────────────────────────────────────
  /** <JsonLd> for the event + breadcrumb schemas. Rendered first, paints nothing. */
  structuredData?: ReactNode
  /** The banner region ABOVE the header: cancelled, just-claimed, ticket-confirmed, cohost invite. */
  notices?: ReactNode
  /** Reserve the mobile action bar's space at the page root (`pb-24 lg:pb-0`). Defaults to true —
   *  a surface that can never show a bar (a signed-out reader has nothing to RSVP to) passes false. */
  hasActionBar?: boolean

  // ── header lockup (handed straight to DetailTemplate) ─────────────────────────────────────────
  /** The full-bleed cover band: uploaded cover, scanned poster, or the date placeholder. */
  cover?: ReactNode
  /** The single back affordance. Never hand-roll a second one above the template. */
  back?: { href: string; label: string }
  /** The page's own breadcrumb trail, carrying the event's REAL title rather than its frozen slug
   *  (LIVE-132). Handed straight to DetailTemplate; see the prop's note there. */
  breadcrumb?: { href: string; label: string }[]
  title: ReactNode
  /** Status / mode chips (In person · Online · This event has ended). */
  badges?: ReactNode
  /** The stacked top-right action column (QR & Share, Edit event, Manage event). */
  actions?: ReactNode
  /** An event page is a marquee destination, so the H1 leads at display scale by default. */
  titleScale?: 'default' | 'display'

  // ── identity ──────────────────────────────────────────────────────────────────────────────────
  identity?: EventIdentitySlots

  // ── body ──────────────────────────────────────────────────────────────────────────────────────
  /** A full-width band at the top of the interior, above the gallery (the claim banner). */
  bodyLead?: ReactNode
  /** The photo gallery (the cover is already the hero, so this is photos 2..n). */
  gallery?: ReactNode
  /** The WHOLE interior, normally <PageModules route={`/events/${slug}`} /> — the operator-arranged
   *  module engine, whose '/events/*' default layout IS the two-column body. */
  interior?: ReactNode
  /** Used INSTEAD of `interior` by a surface with no module engine (a public route has no
   *  setEventContext and no page_settings layout row). Rendered through the SAME grid geometry, so
   *  the two interiors are the same shape by construction, not by coincidence. */
  interiorMain?: ReactNode
  interiorSide?: ReactNode

  // ── mobile ────────────────────────────────────────────────────────────────────────────────────
  /** The sticky bottom action bar (RsvpBottomBar). Absent = no bar. */
  actionBar?: ReactNode
}

// The interior geometry, byte-identical to the `main-side` case of TemplateGrid in
// components/widgets/page-modules.tsx: a 3:2 split from lg, with the SIDE column stacking ABOVE main
// on a phone so a guest sees the Join box and the facts before the long flow.
//
// It is duplicated here rather than imported because importing from page-modules.tsx would drag the
// widget registry, the layout store and 20+ RSCs into a public marketing route's module graph. The
// duplication is pinned by a string-equality assertion in event-standard-layout.test.ts, so the two
// interiors cannot drift apart silently. Edit one, edit both.
function EventInterior({ main, side }: { main?: ReactNode; side?: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-5 lg:gap-8">
      <div className="@container space-y-4 lg:col-span-3">{main}</div>
      <div className="@container order-first space-y-4 lg:order-none lg:col-span-2">{side}</div>
    </div>
  )
}

export function EventDetailTemplate({
  structuredData,
  notices,
  hasActionBar = true,
  cover,
  back,
  breadcrumb,
  title,
  badges,
  actions,
  titleScale = 'display',
  identity = {},
  bodyLead,
  gallery,
  interior,
  interiorMain,
  interiorSide,
  actionBar,
}: EventDetailTemplateProps) {
  const lines = [
    identity.when,
    identity.where,
    identity.cadence,
    identity.nextDate,
    identity.seriesRail,
    identity.belonging,
    identity.hostedBy,
    identity.credit,
    identity.reward,
  ]
  // An event with nothing to say under its title gets no stack container at all, rather than an
  // empty div carrying the subtitle margin.
  const hasIdentity = lines.some((line) => line !== undefined && line !== null && line !== false)

  return (
    <div className={hasActionBar ? 'pb-24 lg:pb-0' : undefined}>
      {structuredData}
      {notices}

      <DetailTemplate
        hero={cover}
        back={back}
        breadcrumb={breadcrumb}
        titleScale={titleScale}
        title={title}
        badges={badges}
        actions={actions}
        subtitle={
          hasIdentity ? (
            <div className="space-y-1.5">
              {identity.when}
              {identity.where}
              {identity.cadence}
              {identity.nextDate}
              {identity.seriesRail}
              {identity.belonging}
              {identity.hostedBy}
              {identity.credit}
              {identity.reward}
            </div>
          ) : undefined
        }
      >
        {bodyLead}
        {gallery}
        {interior ??
          (interiorMain !== undefined || interiorSide !== undefined ? (
            <EventInterior main={interiorMain} side={interiorSide} />
          ) : null)}
      </DetailTemplate>

      {actionBar}
    </div>
  )
}
