import Image from 'next/image'

// POSTER BAND — the cover band for a surface whose cover is ARTWORK rather than scenery.
//
// ── ONE FIT, EVERY WIDTH: FULL BLEED, CROPPED AT THE HOST'S FOCAL POINT ─────────────────────────
// Owner, 2026-09-10: *"It should be full bleed and cropped to the selected area."*
//
// That is the THIRD report on this band, and the three of them are one argument, so read the whole
// arc before changing the fit again:
//
//   2026-08-31  the band was a fixed box with `object-cover` at a shape that cropped the WIDTH.
//               The Meld flyer (1400x600) in a 380x306 phone band lost 47% of itself, and the
//               missing half carried both ends of the event's name.  ->  went to `object-contain`.
//   2026-09-04  contain on a phone painted a 221x221 square of poster in the middle of a 412x221
//               band, between two blurred bars, and the focal picker had nothing left to aim.
//               ->  the PHONE half went back to `object-cover`, at a band reshaped short and wide.
//   2026-09-10  the DESKTOP half was still containing, so the marquee surface still showed the
//               poster boxed between blurred bars — and the focal picker, whose preview is a CROP,
//               was describing a frame the page did not paint.  ->  cover at every width.
//
// 🔴 THE THING THAT MAKES THIS SETTLED RATHER THAN A FOURTH SWING is that the band no longer
// guesses its own shape. Since ADR-1248 it knows the poster's intrinsic aspect (measured in the
// browser by the focal picker, stored on `events.theme.coverAspect`) and sizes itself to it, with
// the host's height tier as a CEILING. So:
//
//   a cover that fits under the tier at the band's width   the band IS the poster. `cover` and
//                                                          `contain` paint the identical pixels,
//                                                          because there is nothing to crop and no
//                                                          bar to fill. The 2026-08-31 flyer is
//                                                          this case: whole, on every screen.
//   a cover TALLER than the tier (a square or portrait      the tier clamps the band and the crop
//   poster — 19 of the 24 in production)                    falls on the HEIGHT, aimed by `focus`.
//                                                          That is "the selected area", and the
//                                                          picker previews exactly this frame.
//
// The 2026-08-31 failure needed BOTH halves to happen: a band shaped wrong for the artwork AND a
// crop. Take away the guessed shape and `object-cover` can only ever cut the axis the picker aims.
// A band with NO stored aspect falls back to the tier height, and there `cover` is the honest fit
// too: the alternative is bars, which is what was reported.
//
// ── WHAT WENT WITH THE LETTERBOX ────────────────────────────────────────────────────────────────
// The blurred backdrop is GONE. It existed to fill `contain`'s bars with a scaled, dimmed copy of
// the poster (the Apple TV / Spotify treatment) so a letterbox read as framing rather than as a
// gap. A band that covers is opaque edge to edge at every width, so the backdrop was a second
// decode of the same image painting nothing — a straight cost on the surface least able to afford
// one. If a fit that letterboxes ever comes back, the backdrop comes back with it; nothing else in
// this file references it.
//
// ── THE HEIGHT PICKER IS STILL THE LEVER FOR THE TRADE ──────────────────────────────────────────
// The tier decides how much of a tall poster survives the clamp, and on a phone (where the band is
// one rung shorter, lib/layout/cover-height.ts) it decides the band's aspect outright:
//
//   Short    412x170   2.42:1   the widest band, so the deepest height crop and no width crop at all
//   Standard 412x221   1.86:1   full width for the 19 square/portrait covers of 24
//   Tall     412x306   1.35:1   most height kept, so the widest flyers lose the most width
//
// A host with a very wide flyer picks Short; one with a portrait poster picks Tall. Same control,
// same trade, in the panel the focal picker already lives in.

export function PosterBand({
  src,
  heightClass,
  maxHeightClass,
  aspect,
  radiusClass = 'rounded-2xl',
  widthClass = 'w-full',
  focus,
  alt = '',
  unoptimized = false,
  className = '',
}: {
  /** The cover's URL. */
  src: string
  /** The band's height. Pass `posterHeightClass(tier)` — the shared ladder with a shorter phone
   *  half, which is what keeps the phone crop horizontal-safe (lib/layout/cover-height.ts). */
  heightClass: string
  /** The band's CEILING when `aspect` is known: pass `posterMaxHeightClass(tier)`, the same ladder
   *  as `max-h-*`. Ignored without `aspect`. */
  maxHeightClass?: string
  /** The poster's intrinsic width / height as the browser measured it (events.theme.coverAspect,
   *  lib/events/cover-aspect.ts). With it, the band is the poster's own shape up to `maxHeightClass`.
   *  Null or absent keeps the tier-height band above. */
  aspect?: number | null
  /** The band's corner radius, substituted into the base class string.
   *
   *  🔴 A PROP AND NOT SOMETHING YOU APPEND VIA `className`. This repo's `cn` is a plain join with
   *  no tailwind-merge, so two competing `rounded-*` classes are settled by Tailwind's alphabetical
   *  EMISSION order, not by the order you wrote them (the measurement is recorded in
   *  components/ui/skeleton.tsx). Appending `rounded-none` to override a baked-in `rounded-2xl`
   *  would work today by luck of the alphabet and silently invert the day a token is renamed. */
  radiusClass?: string
  /** The band's width, substituted into the base class string.
   *
   *  🔴 A PROP FOR THE SAME REASON AS `radiusClass`, AND IT IS HERE BECAUSE THE LESSON DID NOT
   *  TRANSFER. This component protected the radius from the no-tailwind-merge trap and then baked
   *  `w-full` into the same base string. The event page wanted a full-bleed phone band, so it passed
   *  `className="-mx-4 w-auto sm:mx-0 sm:w-full"` — and the rendered element carried BOTH `w-full`
   *  and `w-auto`. `w-full` won.
   *
   *  The result shipped and the owner reported it off a phone: `-mx-4` still pulled the band one
   *  gutter left, but the width never grew to match, so the band bled off the LEFT edge and stopped
   *  TWO gutters short on the RIGHT. Full-bleed on one side, a 34px stripe of page colour on the
   *  other. The geometry is exact — margin-left:-1rem with width:100% of a `px-4` content box puts
   *  the right edge at `viewport - 2rem`.
   *
   *  A full-bleed caller passes `widthClass="w-auto sm:w-full"` and keeps the margins in
   *  `className`. Nothing appends a second `w-*`. */
  widthClass?: string
  /** The operator's focal point ("x% y%"), from the header controls' focus picker.
   *
   *  🔴 THIS IS "THE SELECTED AREA". The band covers at every width, so `object-position` decides
   *  which slice of the poster survives wherever the tier clamps it — and because a clamped band is
   *  always SHORTER than the artwork at that width, never narrower, that slice is vertical. The
   *  picker's own hint ("Vertical matters most") is describing this crop.
   *
   *  It is inert, correctly, for a cover the band takes the shape of: nothing is cropped, so there
   *  is nothing to aim. The picker previews the same frame and shows the whole poster there too. */
  focus?: string | null
  /** Decorative by default — on an event page the title is the very next element, so announcing
   *  the cover twice is noise. Pass a real string only when the artwork carries information the
   *  page does not otherwise state. */
  alt?: string
  /** Bypass the image optimizer. Required for a scanned poster's SIGNED URL, which is outside
   *  next.config's remotePatterns (see the event page's cover slot). */
  unoptimized?: boolean
  className?: string
}) {
  // The shaped path needs a usable ratio AND a ceiling; anything less is the tier-height band.
  const shaped = typeof aspect === 'number' && Number.isFinite(aspect) && aspect > 0 && !!maxHeightClass
  const sizeClass = shaped ? maxHeightClass : heightClass
  return (
    <div
      className={`relative ${sizeClass} ${widthClass} overflow-hidden ${radiusClass} bg-surface-elevated ${className}`}
      style={shaped ? { aspectRatio: String(aspect) } : undefined}
    >
      {/* THE POSTER, full bleed at every width, aimed by the host's focal point wherever the tier
          clamps the band shorter than the artwork. No backdrop: a covering band has no bars. */}
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 1024px) 100vw, 1344px"
        className="object-cover"
        style={{ objectPosition: focus ?? undefined }}
        preload
        unoptimized={unoptimized}
      />
    </div>
  )
}
