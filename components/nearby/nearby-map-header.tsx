'use client'

import { useState } from 'react'
import { Map as MapIcon } from 'lucide-react'
import { MapCanvas } from '@/components/maps/map-canvas'
import { PageHero, HERO_ACTION_CLASS, type PageHeroSize, type PageHeroVariant } from '@/components/templates/page-hero'
import type { MapPin } from '@/components/maps/types'
import { MAP_PIN_KINDS, MAP_PIN_LAYERS, type MapPinKind } from '@/lib/maps/pin-kinds'

// ── THE AROUND YOU HEADER: THE MAP IS THE BAND ──────────────────────────────────────────────────
//
// The page used to open on a plain PageHeading with the map as a section halfway down it. It now
// opens on the SAME header system every browse surface uses (PageHero, the one canonical band, sized
// and tuned by the `header` element in /admin/elements) with one difference: the pixels behind the
// scrim are a live map of what is around the member rather than a photograph (ADR-1034).
//
// WHY A HEADER AND NOT A BIGGER MAP. A map you can pan is a tool, and a tool halfway down a page is
// furniture. A map you can SEE the moment the page paints is an answer to the question the page's
// title asks. So the band is the answer, and the tool is one button away.
//
// ── THE ONE CLIENT COMPONENT, AND WHY IT IS ONE ─────────────────────────────────────────────────
//
// The backdrop and the "View the map" button are separated by the whole header band in the DOM (one
// is behind the scrim, one is in the centered lockup) and they share ONE piece of state: whether the
// popup is open. Two islands plus a context provider would be three files to express a boolean, so
// this is a single client component that composes the server-friendly PageHero. PageHero has no
// hooks, so it costs the client bundle its markup and nothing else.
//
// THE POPUP IS THE SEAM'S, NOT OURS. `MapCanvas` already owns the fullscreen dialog (backdrop, ESC,
// scroll-lock, focus trap, focus restore, safe-area insets) via components/ui/dialog.tsx. It grew
// `expandControl` + `expanded`/`onExpandedChange` for this caller, so the trigger can live in the
// hero lockup while the overlay stays exactly where it was. The alternative was hand-rolling a
// second dialog next to a working one, which is how components/circles/circles-map.tsx ended up
// with an ESC listener and none of the rest.
//
// ── THE BACKDROP IS INERT, DELIBERATELY, AND `inert` IS THE WORD ON PURPOSE ─────────────────────
//
// `interactive={false}` + `pointer-events-none` + `inert`. A member dragging the header instead of
// scrolling the page is a worse map than no map, and a screen reader walking a marker tree behind a
// scrim hears a list of places with no way to act on them. The REAL map, the one that pans and
// zooms and opens a card per pin, is what the button opens.
//
// 🔴 IT SHIPPED AS `aria-hidden` FIRST, AND THAT WAS A REAL BARRIER, caught by the axe run on the
// preview (PR #2136) after the browserless test passed. `aria-hidden` hides a subtree from the
// accessibility tree WITHOUT removing it from the tab order, and a map engine injects its own
// focusable chrome (the terms and "report a map error" links, the keyboard-shortcuts control,
// markers). So a keyboard user tabbed into controls that a screen reader had been told do not
// exist — the `aria-hidden-focus` rule, and one of the few axe rules that names an actual trap.
// `inert` removes the subtree from BOTH, which is what "decorative" was always supposed to mean.
//
// ⚠️ THE JSDOM TEST COULD NOT HAVE CAUGHT IT. Both engines are `ssr: false`, so nothing focusable
// exists in a server render — the container is empty there. This is the honest limit named in
// test/a11y/nearby-map-header.a11y.test.tsx, and the reason the e2e a11y ratchet is not redundant
// with it: only a real browser has a real map inside the box.
//
// ⚠️ ATTRIBUTION. The scrim darkens the engine's own attribution chrome along with everything else.
// The fully attributed, unobscured map is one tap away in the popup, and this band is decorative.
// If the operator wants the attribution legible in the band itself, the fix is the overlay control
// in /admin/elements (a lighter scrim or `fade`), not a code change here.

/** The one label, on the button and on the popup's accessible name, so what a member clicked and
 *  what a screen reader announces are the same words. Plain, no em dash (docs/CONTENT-VOICE.md). */
const VIEW_MAP_LABEL = 'View the map'

/** The layer legend + the two honesty lines, under the band.
 *
 *  🔴 THE QUALIFIER LINE IS NOT DECORATION. Some dots are AREAS: a host who set `hide_address` and a
 *  Space whose owner chose an approximate location are drawn at a coarsened point
 *  (lib/maps/approximate.ts). Each such pin says so in its own popup, but a popup is read by exactly
 *  the person who tapped that one dot. Everyone else sees precise-looking dots, some of which are
 *  not precise, and would be right to plan around them. This line is the cheapest place to keep that
 *  honest, and it moved down here WITH the map rather than being dropped when the band took over. */
function MapLegend({ pins }: { pins: MapPin[] }) {
  // Which layers are actually represented, so the legend describes THIS map rather than the
  // vocabulary in general. A legend row for a layer with no pins reads as a broken filter.
  const present = new Set(pins.map((p) => p.kind ?? 'place'))
  const legend = MAP_PIN_LAYERS.filter((k) => present.has(k))
  const anyApproximate = pins.some((p) => p.approximate)
  const anyRepeating = pins.some((p) => (p.moreCount ?? 0) > 0)

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {legend.length > 0 && (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {legend.map((kind) => (
            <LegendRow key={kind} kind={kind} />
          ))}
        </ul>
      )}
      {(anyRepeating || anyApproximate) && (
        <p className="text-body-sm text-muted">
          {anyRepeating && 'A number on a pin means it runs on more than one date. '}
          {anyApproximate && 'Some pins show a general area instead of an address.'}
        </p>
      )}
    </div>
  )
}

/** One legend swatch. The colour comes from the SAME table the markers paint from, via the CSS
 *  custom property, so a theme switch moves both together and neither can go stale. The `fallback`
 *  is the light-theme literal, reached only before the property resolves.
 *
 *  ⚠️ `place` is deliberately absent from MAP_PIN_LAYERS: it resolves to the SAME token as `event`,
 *  and a "Places" row in the same orange as "Events" would tell a member two layers are
 *  distinguishable when they are not. Place pins render; the legend does not claim a colour for
 *  them. */
function LegendRow({ kind }: { kind: MapPinKind }) {
  const paint = MAP_PIN_KINDS[kind]
  return (
    <li className="flex items-center gap-1.5 text-body-sm text-muted">
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        // token-ok: the marker colour is a runtime custom property because a Google Symbol needs a
        // concrete string; the swatch reads the same one so the two can never disagree.
        style={{ backgroundColor: `var(${paint.token}, ${paint.fallback})` }}
      />
      {paint.legend}
    </li>
  )
}

export function NearbyMapHeader({
  pins,
  eyebrow,
  title,
  subtitle,
  coverImage,
  variant = 'overlay',
  size = 'large',
  overlay = true,
}: {
  pins: MapPin[]
  eyebrow?: string
  title: string
  subtitle?: string
  /** The operator's hero image (ADR-180), used ONLY when there is no map to draw. A community with
   *  nothing plotted yet still gets the header it was given rather than a grey gradient. */
  coverImage?: string | null
  /** The operator-tunable header config (ADR-793), resolved by the page and forwarded whole, so
   *  Around You reframes from /admin/elements exactly like every other header. */
  variant?: PageHeroVariant
  size?: PageHeroSize
  overlay?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  // No pins, no map: the band keeps PageHero's neutral gradient and drops the button rather than
  // offering a popup onto an empty view.
  const hasMap = pins.length > 0

  return (
    <div>
      <PageHero
        background={
          hasMap ? (
            <div className="pointer-events-none absolute inset-0" inert>
              <MapCanvas
                pins={pins}
                // `center` and `zoom` are only what the map paints BEFORE `fit` runs, so they never
                // decide what a member ends up looking at: the first pin keeps the pre-fit frame in
                // the right hemisphere on a map whose data is entirely regional.
                center={[pins[0].lng, pins[0].lat]}
                zoom={11}
                // Then let the pins decide the real view. `singleZoom` keeps a lone pin from
                // slamming to max zoom, which reads as a bug rather than as one result.
                fit={{ padding: 48, maxZoom: 13, singleZoom: 12 }}
                cluster={{}}
                interactive={false}
                // The dialog is the seam's; only its trigger is ours (see the file header).
                expandable
                expandControl={false}
                expanded={expanded}
                onExpandedChange={setExpanded}
                expandLabel={VIEW_MAP_LABEL}
                className="h-full w-full"
              />
            </div>
          ) : undefined
        }
        // Reached only when there are no pins: `background` wins over `coverImage` in PageHero.
        // `rawImg` because an operator URL can live on a host next/image was never configured to
        // allowlist (the same reason IndexTemplate's overlay branch passes it).
        coverImage={coverImage ?? null}
        rawImg={!!coverImage}
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        variant={variant}
        size={size}
        overlay={overlay}
        actionsLabel="Map actions"
        actions={
          hasMap ? (
            <button type="button" onClick={() => setExpanded(true)} className={HERO_ACTION_CLASS}>
              <MapIcon className="h-4 w-4" aria-hidden="true" />
              {VIEW_MAP_LABEL}
            </button>
          ) : undefined
        }
      />

      {hasMap ? (
        <MapLegend pins={pins} />
      ) : (
        <p className="mt-3 text-body-sm text-muted">
          Nothing on the map yet. Events, Circles and Spaces show up here once they have a location.
        </p>
      )}
    </div>
  )
}
