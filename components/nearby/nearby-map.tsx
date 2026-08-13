import { MapPin as MapPinIcon } from 'lucide-react'
import { MapCanvas } from '@/components/maps/map-canvas'
import type { MapPin } from '@/components/maps/types'
import { MAP_PIN_KINDS, MAP_PIN_LAYERS, type MapPinKind } from '@/lib/maps/pin-kinds'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'

// ── THE AROUND YOU MAP (ADR-1022's first caller) ────────────────────────────────────────────────
//
// The map seam shipped in #2115 with no caller: a contract, two engines, a shared clustering brain
// and a parity guard, and nothing on screen. This is the surface it was built for.
//
// A SERVER COMPONENT, deliberately, and that is the whole design of the thing. `MapCanvas` is the
// only client boundary, and every pin already carries its own popup content (`title`, `subtitle`,
// `href`, `hrefLabel`), which both engines render natively. So there is no `onPinClick` handler
// here and no client wrapper around it: a card on tap costs zero extra JavaScript, because the
// engine was always able to draw one. Reaching for `onPinClick` would have meant a client component
// holding selection state, on a page whose interactivity budget is already the thing the owner
// notices (the nav-click investigation runs beside this one).
//
// CLUSTERING IS ON. `cluster={{}}` takes lib/maps/cluster.ts's defaults: merge within ~56px, stop
// clustering at zoom 15 so a member can always reach an individual pin. Around You is a whole
// region's worth of events, circles and spaces in one view; unclustered, a dense neighbourhood
// paints one pin on top of another and the map says less than the list beside it.
//
// EXPANDABLE. The seam composes the shared dialog for fullscreen (backdrop, ESC, scroll-lock, focus
// trap, focus restore, safe-area inset), so this page gets all of that from one prop. Note for
// anyone tempted to copy the older pattern: `MapBanner` in components/circles/circles-map.tsx
// hand-rolled its own ESC listener and got none of the rest. It predates the seam and should move
// onto it; that is booked, not done here.
//
// ── THE LEGEND, AND ONE HONEST GAP ──────────────────────────────────────────────────────────────
//
// The legend is built FROM `MAP_PIN_KINDS`, the same table the engines paint from, so it cannot
// drift into claiming a colour the map does not use. That is the point of the table existing.
//
// ⚠️ IT LISTS ONLY THE KINDS ACTUALLY ON THE MAP, and only those `MAP_PIN_LAYERS` names. `place` is
// deliberately absent from that list, and there is a real reason a reader should know: `place` and
// `event` resolve to the SAME token (`--color-primary`). `place` is documented as the neutral
// default for a pin belonging to no layer, and every pre-ADR-1022 map still relies on that default,
// so giving it a colour of its own would silently recolour four shipped maps. A legend row for
// "Places" in the same orange as "Events" would be worse than no row: it would tell a member two
// layers are distinguishable when they are not. So place pins render, and the legend does not claim
// they are a separate colour. Giving `place` its own token is a one-line change to the shared table
// plus a look at those four maps, and it needs an owner's eye on the palette, not a 3am guess.

export function NearbyMap({ pins }: { pins: MapPin[] }) {
  // Which layers are actually represented, so the legend describes THIS map rather than the
  // vocabulary in general. A legend row for a layer with no pins reads as a broken filter.
  const present = new Set(pins.map((p) => p.kind ?? 'place'))
  const legend = MAP_PIN_LAYERS.filter((k) => present.has(k))

  // 🔴 SOME DOTS ARE AREAS, AND THE MAP HAS TO SAY SO WHERE EVERYONE READS IT. A host who set
  // `hide_address`, and a Space whose owner chose an approximate location, are drawn at a coarsened
  // point (lib/maps/approximate.ts). Each of those pins says so in its own popup, but a popup is
  // read by exactly the person who tapped that one dot. Everyone else sees a map of precise-looking
  // dots, some of which are not precise, and would be right to plan around them. One line under the
  // legend is the cheapest place to keep that honest.
  const anyApproximate = pins.some((p) => p.approximate)

  // How many of these pins stand for more than one date, so the copy under the map can explain the
  // `1+` bubbles rather than leaving a member to guess what the `+` means.
  const anyRepeating = pins.some((p) => (p.moreCount ?? 0) > 0)

  return (
    <section aria-labelledby="nearby-map-heading" className="mb-8">
      <SectionHeader
        id="nearby-map-heading"
        title="On the map"
        count={pins.length > 0 ? pins.length : undefined}
      />

      {pins.length === 0 ? (
        <EmptyState
          icon={MapPinIcon}
          title="Nothing on the map yet"
          description="Events, Circles and Spaces show up here once they have a location. Add a place to yours and it lands on the map."
        />
      ) : (
        // Every layer in that empty state can now actually appear. It was a promise the schema could
        // not keep until ADR-1026 gave `spaces` a coordinate to hold; before that it named three
        // layers at a member while one of them was unreachable by construction.
        <>
          <MapCanvas
            pins={pins}
            // `center` and `zoom` are the seam's required opening view. They are only what the map
            // paints BEFORE `fit` runs, so they never decide what a member ends up looking at: the
            // first pin is a better guess than a hardcoded city, and it keeps the pre-fit frame in
            // the right hemisphere on a map whose data is entirely regional.
            center={[pins[0].lng, pins[0].lat]}
            zoom={11}
            // Then let the pins decide the real view. `singleZoom` keeps a lone pin from slamming
            // to max zoom, which reads as a bug rather than as one result.
            fit={{ padding: 48, maxZoom: 13, singleZoom: 12 }}
            cluster={{}}
            expandable
            expandLabel="Open the full map"
            className="aspect-[12/5] w-full overflow-hidden rounded-2xl"
          />

          {legend.length > 0 && (
            <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {legend.map((kind) => (
                <LegendRow key={kind} kind={kind} />
              ))}
            </ul>
          )}

          {(anyRepeating || anyApproximate) && (
            <p className="mt-2 text-body-sm text-muted">
              {anyRepeating && 'A number on a pin means it runs on more than one date. '}
              {anyApproximate && 'Some pins show a general area instead of an address.'}
            </p>
          )}
        </>
      )}
    </section>
  )
}

/** One legend swatch. The colour comes from the SAME table the markers paint from, via the CSS
 *  custom property, so a theme switch moves both together and neither can go stale. The `fallback`
 *  is the light-theme literal, reached only before the property resolves. */
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
