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
// no operator actions because it omits `actions` — not because the template knows who is looking.
//
// THERE IS NO STICKY ACTION BAR SLOT (removed 2026-08-31, owner). It carried a mobile RSVP bar that
// duplicated the Join box the interior already renders — the SIDE column stacks FIRST on a phone,
// so the RSVP control is the first thing under the header — and it cost the fixed bottom lane plus
// a `pb-24 lg:pb-0` reservation on EVERY event page to say the same thing twice. Both are gone.

import type { ReactNode } from 'react'
import { DetailTemplate } from './detail-template'

/** The identity region under the H1, in the ONE arrangement every event surface renders it.
 *  Naming each line (rather than taking one opaque `subtitle` blob) is what makes the shape itself
 *  the standard: a surface can leave a line out, but it cannot put "Hosted by" above the date.
 *
 *  ── ONE FULL-WIDTH COLUMN, IN FOUR GROUPS (owner, 2026-09-10) ──────────────────────────────────
 *  *"The info area under the header should not be two columns. The info should be full width in
 *  that area. Re organize that sub header content area to be clean and make sense."*
 *
 *  🔴 THIS REVERSES THE TWO-LANE ARRANGEMENT SHIPPED EARLIER THE SAME DAY, deliberately. The
 *  region's first form was one NARROW column inside DetailTemplate's `subtitle`, squeezed beside
 *  the action buttons for its whole height ("Something is off with the details under the header.
 *  They are all aligned left"). That fix did two things at once: it moved the region to the
 *  full-width `meta` slot, and it split the region into two lanes. Only the first was what the
 *  report wanted. Two lanes of four short lines read as a form, and they set "Hosted by" beside
 *  the date instead of under it. The slot moved and stays moved; the lanes are gone.
 *
 *  One column across the whole band, grouped in the order a reader asks:
 *
 *    the gathering   when · where                      what a guest needs in order to decide
 *    the series      cadence · nextDate · seriesRail    how often, and which dates
 *    who runs it     hostedBy · belonging · credit      the person, the Circle, the poster
 *    the reward      reward                             the check-in strip, a band by nature
 *
 *  The gap BETWEEN groups is wider than the gap inside one, so the stack reads as four things
 *  rather than nine lines. An empty group renders nothing at all, so a one-off event reads
 *  when · where · who with no hole where the series would have been.
 *
 *  The declaration order below IS the render order, and event-standard-layout.test.ts pins the
 *  two together. */
export interface EventIdentitySlots {
  /** The when-line. The key fact, rendered a step stronger than the rest of the region. */
  when?: ReactNode
  /** The where-line: venue, address, map deep link. */
  where?: ReactNode
  /** "Every other Wednesday" / "Part of a recurring series" (+ until). */
  cadence?: ReactNode
  /** "Next: …" for a recurring anchor whose own date has passed. */
  nextDate?: ReactNode
  /** The series date rail (ADR-897): a ROW of date chips, so it sits under the two lines that
   *  describe the same series rather than mid-column where it wrapped into three rows. */
  seriesRail?: ReactNode
  /** "Hosted by …" (+ collaborators, + organizer credit). The headline attribution, so it leads
   *  its group. */
  hostedBy?: ReactNode
  /** Where this event belongs: its Circle, Space, Journey. Page owns its own <Suspense>. */
  belonging?: ReactNode
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

  // ── header lockup (handed straight to DetailTemplate) ─────────────────────────────────────────
  /** The full-bleed cover band: uploaded cover, scanned poster, or the date placeholder. */
  cover?: ReactNode
  /** The single back affordance. Never hand-roll a second one above the template. */
  back?: { href: string; label: string }
  /** The page's own breadcrumb trail, carrying the event's REAL title rather than its frozen slug
   *  (LIVE-132). Handed straight to DetailTemplate; see the prop's note there. */
  breadcrumb?: { href: string; label: string }[]
  title: ReactNode
  /** Status / mode chips (In person · Online · This event has ended).
   *
   *  These ride the TOP RIGHT OF THE COVER (owner, 2026-09-10: "Place the In Person / Online pill
   *  on the top right of the header" — "the header" is the cover band, the same sense in which it
   *  was reported full-bleed the same morning). A surface that fills no `cover` has nowhere to
   *  put them, so there they fall back to DetailTemplate's own slot beside the H1 and render
   *  exactly as they always did. That is a slot test, not a per-surface branch. */
  badges?: ReactNode
  /** The compact header action row (Share · Manage · Edit). */
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
}: EventDetailTemplateProps) {
  const filled = (line: ReactNode) => line !== undefined && line !== null && line !== false
  const gathering = [identity.when, identity.where]
  const series = [identity.cadence, identity.nextDate, identity.seriesRail]
  const runBy = [identity.hostedBy, identity.belonging, identity.credit]
  const hasGathering = gathering.some(filled)
  const hasSeries = series.some(filled)
  const hasRunBy = runBy.some(filled)
  // An event with nothing to say under its title gets no region container at all, rather than an
  // empty div carrying the region's margin. Each GROUP self-suppresses the same way, so a one-off
  // event has no empty gap where its series lines would have been.
  const hasIdentity = hasGathering || hasSeries || hasRunBy || filled(identity.reward)

  return (
    <div>
      {structuredData}
      {notices}

      <DetailTemplate
        // THE MODE PILL RIDES THE COVER. `badges` used to sit inline beside the H1, where it read
        // as a third thing competing with the title and the action row for one line. It now sits
        // in the cover's top-right corner (owner, 2026-09-10), which is where a poster carries its
        // own designation and where nothing else on the page wants to be. The chips are opaque
        // token surfaces, so they stay legible over any artwork; `max-w` keeps the longest label
        // ("In person + online") off the title's shoulder on a narrow phone.
        //
        // With no cover there is no corner, so the pill goes back to DetailTemplate's own slot and
        // that surface renders exactly as before — an absent slot, not a per-surface branch.
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
        back={back}
        breadcrumb={breadcrumb}
        titleScale={titleScale}
        title={title}
        badges={cover !== undefined && badges ? undefined : badges}
        actions={actions}
        // The identity region goes through `meta` (full width), NOT `subtitle` (the narrow column
        // beside the actions). See EventIdentitySlots for the report that moved it.
        // The identity region goes through `meta` (full width), NOT `subtitle` (the narrow column
        // beside the actions). See EventIdentitySlots for the two reports that settled its shape.
        meta={
          hasIdentity ? (
            // `space-y-3` between groups against `space-y-1.5` inside one: the whole reorganisation
            // is carried by that 2:1 ratio, which is what lets a reader see four things instead of
            // nine lines without a single rule or heading.
            <div className="space-y-3 text-body-sm text-muted">
              {hasGathering && (
                <div className="space-y-1.5">
                  {identity.when}
                  {identity.where}
                </div>
              )}
              {hasSeries && (
                <div className="space-y-1.5">
                  {identity.cadence}
                  {identity.nextDate}
                  {identity.seriesRail}
                </div>
              )}
              {hasRunBy && (
                <div className="space-y-1.5">
                  {identity.hostedBy}
                  {identity.belonging}
                  {identity.credit}
                </div>
              )}
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

    </div>
  )
}
