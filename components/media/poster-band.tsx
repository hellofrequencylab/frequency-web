import Image from 'next/image'

// POSTER BAND — the cover band for a surface whose cover is ARTWORK rather than scenery.
//
// 🔴 THE BUG IT EXISTS TO FIX (owner, 2026-08-31, off a phone capture of the Meld event page).
// The event page's cover is a fixed-height box with `object-cover` on it. `object-cover` fills
// the box and throws away whatever does not fit — which is the right treatment for a PHOTOGRAPH,
// where the edges are scenery, and the wrong one for a POSTER, where the edges are the words.
// On that capture the poster's own title was sliced down the middle on both sides: the reader saw
// "Creating What's N", "eld @ Roy", "nity Coworking".
//
// It is arithmetic, not taste. The poster is 1400x600 (2.33:1). The mobile band is the page's
// content width minus its gutters by `h-72` — 380x306 at a 412px viewport and this app's 17px
// root — which is 1.24:1. `object-cover` scales the source until it covers the SHORTER axis, so a
// 2.33:1 image in a 1.24:1 box is scaled by height and then cropped by width: 380 of 714 rendered
// pixels survive. 53% OF THE POSTER IS NOT ON THE PAGE, and the missing half is the half with the
// event's name in it.
//
// MEASURED ACROSS ALL 24 DISTINCT EVENT COVERS IN PRODUCTION (2026-08-31), as the fraction of the
// artwork's AREA that survives the crop:
//   mobile  (380x306)   median 81%, worst 53%   —  8 of 24 lose more than a quarter
//   desktop (1044x374)  median 36%, worst 24%   — 23 of 24 lose more than a quarter
// The desktop column is the more alarming number and is deliberately NOT addressed here: the
// owner's report was about phones, desktop crops VERTICALLY (which trims a photo's sky, not a
// headline's letters), and every one of those covers has an operator-set focal point aimed at the
// crop it currently gets. Widening this to desktop is a separate, louder change. What the numbers
// do say is that the fixed-aspect band is structurally wrong for posters on BOTH surfaces, and
// that this component is where that gets fixed when the desktop half is taken.
//
// WHY THE POSTERS ARE SQUARE, which is the part that makes a fixed band unwinnable: 13 of those 24
// are 1:1 and 6 more are portrait. That is not an accident of this community — Luma and Partiful
// both tell hosts to upload a 1:1 cover, and both warn that other views may crop it. So the app is
// rendering square-by-convention artwork inside a 2.79:1 letterbox and asking the crop to be kind.
//
// ── THE TREATMENT ────────────────────────────────────────────────────────────────────────────────
// AT EVERY WIDTH: `object-contain`, over a blurred, scaled copy of the same image. Below `sm` the
// band is also one tier shorter than the ladder's (posterHeightClass, lib/layout/cover-height.ts);
// from `sm` up the band keeps the exact height it has always had, so page layout does not move.
//
// `contain` is what guarantees the fix: it fits the WHOLE poster inside the band at any aspect, so
// nothing is ever cut, for every cover that exists today and every one uploaded tomorrow. Its cost
// is that a poster whose shape differs from the band's leaves bars, and a bar of dead page colour
// under a piece of artwork reads as a rendering failure. So the bars are filled with the poster
// itself — scaled up, blurred and dimmed — which is the standard letterbox treatment (Apple TV,
// Spotify, YouTube) and reads as deliberate framing rather than a gap.
//
// WHY THE BAND ALSO GETS SHORTER, rather than just changing the fit: `contain` inside the OLD 306px
// band would paint the Meld poster 380x163 with 71px of blurred filler above and below it — the
// whole poster, correctly, inside a box two-thirds the height of which is now backdrop. The owner's
// words for the fix were "make it shorter and more of a horizontal layout, to show the full width",
// and the second half without the first just moves the wasted space around. 306 -> 221px at the
// standard tier; the `sm:` heights are untouched.
//
// ── 🔴 THE DESKTOP HALF, TAKEN 2026-08-31 (LIVE-131) ─────────────────────────────────────────────
// This shipped as `object-contain sm:object-cover`, and the comment here argued for keeping the
// desktop crop on three grounds. Two of them did not survive being looked at again:
//
//   · "the report was about phones" — true, and irrelevant to whether desktop is broken. It is:
//     median 36% of the artwork, 23 of 24 covers losing more than a quarter. That is the worse
//     number of the two, and it stayed unfixed only because nobody had measured it.
//   · "desktop crops VERTICALLY, which trims a photo's sky rather than a headline's letters" —
//     true of a PHOTO. 19 of the 24 covers are square or portrait, i.e. posters, whose top and
//     bottom are where the date and the venue are. A vertical crop eats those.
//   · "all 24 carry an operator focal point aimed at the crop they get" — the one real cost, and
//     it is smaller than it sounds: with `contain` nothing is cropped, so there is no framing
//     decision left to honour. The focal value is not deleted and the picker still writes it; it
//     simply has nothing to aim while the whole poster is shown.
//
// WHAT IT COSTS. A landscape PHOTO cover (5 of the 24) now letterboxes instead of filling the
// band — 560x374 of a 1044px band for a 3:2 photo, with its own blurred colour either side. That
// is the deliberate trade: the majority case is a poster that was losing its text, and a photo
// shown whole inside its own wash is a weaker look, not a broken one.
//
// The band's `sm:` HEIGHT is untouched, so nothing on the page moves.
//
// 🔴 IT NEEDS NO STORED DIMENSIONS, AND THAT IS THE POINT. The exact fix is to size the band to the
// poster's own aspect, which needs the poster's intrinsic size — and there is nowhere cheap to get
// it. `events` stores none (only `library_assets` carries width/height, and event covers do not go
// through the Loom). Measuring on the server means `sharp`, which lib/library/image-describe.ts
// already refuses for this exact seam: sharp reaches 69 of check:og-trace's 100-function budget and
// 1510 MB of check:build-budget, and the event page fans out across the route table. Measuring by
// fetching the image header at render time means a blocking subrequest on a marquee page, in a repo
// that is currently tracking 572 requests killed at Vercel's 300s ceiling (LIVE-124). `contain`
// costs one CSS keyword, cannot fail, and cannot time out.
//
// THE FOLLOW-UP THAT REMOVES THE BARS ENTIRELY is to capture the aspect in the BROWSER at upload —
// the uploader has already decoded the file — and travel it to the server as a form field, exactly
// as lib/library/image-describe.ts does for blurhash and palette. Store it on the existing
// `events.theme` jsonb beside `coverFocus` (no migration), give this component an `aspect` prop,
// and the band becomes the poster's own shape: no bars, no crop, no letterbox. This component is
// shaped so that is a prop and a class, not a rewrite.

export function PosterBand({
  src,
  heightClass,
  focus,
  alt = '',
  unoptimized = false,
  className = '',
}: {
  /** The cover's URL. Used twice: once as the poster, once as its own blurred backdrop. */
  src: string
  /** The band's height. Pass `posterHeightClass(tier)` — the shared ladder with a shorter phone
   *  half (lib/layout/cover-height.ts). */
  heightClass: string
  /** The operator's focal point ("x% y%").
   *
   *  ⚠️ INERT WHILE THE BAND CONTAINS, and kept on purpose. `object-position` moves an image
   *  inside its box only when the box crops it; with `object-contain` the whole poster fits, so
   *  there is nothing to aim. The prop stays because the operator's focal picker still writes the
   *  value, the callers still hold it, and it is the one thing a future re-crop would need — a
   *  deleted prop would have to be rediscovered and re-threaded through three call sites. */
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
  return (
    <div className={`relative ${heightClass} w-full overflow-hidden rounded-2xl bg-surface-elevated ${className}`}>
      {/* THE BACKDROP. The same image, scaled past the edges so the blur has pixels to work with
          all the way out (a blur samples beyond its own box and would otherwise fade to
          transparent at the frame), then dimmed so it stays clearly BEHIND the poster rather than
          competing with it. Decorative and inert: it is the poster again, so it carries nothing a
          reader needs and must never take a tap. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 scale-125 bg-cover bg-center opacity-45 blur-2xl"
        style={{ backgroundImage: `url("${src}")` }}
      />
      {/* THE POSTER, whole, at every width. `object-contain` is the entire fix. */}
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 1024px) 100vw, 1344px"
        className="object-contain"
        style={{ objectPosition: focus ?? undefined }}
        preload
        unoptimized={unoptimized}
      />
    </div>
  )
}
