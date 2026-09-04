import Image from 'next/image'

// POSTER BAND — the cover band for a surface whose cover is ARTWORK rather than scenery.
//
// ── WHAT THE PHONE BAND DOES, AND WHY IT IS A CROP AGAIN (owner, 2026-09-04) ─────────────────────
// "It should be full bleed and adjusted with the focus picker."
//
// The band below `sm` is FULL BLEED and `object-cover`, positioned at the host's focal point. It
// used to `object-contain` at every width, and the capture that came back is what that costs: on a
// 412px phone the Meld cover — a 1:1 poster — painted 221x221 in the middle of a 412x221 band, i.e.
// 54% of the width, with a blurred wash either side. Whole, and small, inside two bars.
//
// 🔴 READ THE SHAPE OF THE BAND BEFORE READING "CROP" AS A REGRESSION. The phone band is SHORT and
// WIDE (h-52 = 221px at the standard tier, against a 412px full-bleed width — 1.86:1), and
// `object-cover` scales to cover the SHORTER axis. So for any source narrower than 1.86:1 it scales
// by WIDTH: the poster's full width reaches both edges and the crop falls entirely on the height.
// Of the 24 distinct production covers, 13 are 1:1 and 6 are portrait — Luma and Partiful both tell
// hosts to upload a square cover — so 19 of 24 show their FULL WIDTH here, which is the half that
// carries the words. The height they lose is the half the focal picker aims, and its hint already
// says so: "Vertical matters most."
//
// WHAT IT COSTS, stated plainly, because this is the direction that produced the original report
// (LIVE-130, 2026-08-31): a source WIDER than the band still crops horizontally. A 2.33:1 flyer at
// the standard tier keeps 80% of its width — 1400x600 scales to 515x221, cropped to 412 — against
// the 53% that was photographed and reported that day. Better, but not whole, and aimed rather
// than arbitrary.
//
// AND THE HEIGHT PICKER IS THE LEVER FOR IT, which is worth knowing before reaching for a fourth
// fit. The tiers move the phone band's ASPECT, and the aspect is what decides which axis gets cut:
//
//   Short    412x170   2.42:1   full width for every cover in the survey, the deepest height crop
//   Standard 412x221   1.86:1   full width for the 19 square/portrait covers of 24
//   Tall     412x306   1.35:1   most height kept, so the widest flyers lose the most width
//
// So a host with a very wide flyer picks Short, and one with a portrait poster picks Tall. That is
// the same control, pointed at the same trade, from the panel the focal picker already lives in.
//
// ── FROM `sm` UP NOTHING CHANGED: the desktop band still CONTAINS ────────────────────────────────
// The desktop band is 1044px wide against the same tier heights (1044x374 at standard, 2.79:1),
// which is a letterbox no crop is kind to: measured across those same 24 covers, `object-cover`
// there showed a median 36% of the artwork and 23 of 24 lost more than a quarter. LIVE-131 took it to
// `contain`, and the owner's report is about phones. One fit per surface, each measured on the
// geometry that surface actually has:
//
//   phone   (412x221 full bleed, 1.86:1)  cover   — full width for 19 of 24, height aimed by focus
//   desktop (1044x374, 2.79:1)            contain — the whole poster over its own blurred wash
//
// THE BACKDROP therefore lives from `sm` up only. It exists to fill the letterbox bars with the
// poster itself — scaled, blurred, dimmed, the standard treatment (Apple TV, Spotify, YouTube) — so
// `contain` reads as deliberate framing rather than a gap. A covered phone band has no bars to fill,
// so painting a blurred copy under an opaque one there is a wasted decode on the surface least able
// to afford it.
//
// 🔴 IT NEEDS NO STORED DIMENSIONS, AND THAT IS STILL THE POINT. The exact fix for both halves is to
// size the band to the poster's own aspect, which needs the poster's intrinsic size — and there is
// nowhere cheap to get it. `events` stores none (only `library_assets` carries width/height, and
// event covers do not go through the Loom). Measuring on the server means `sharp`, which
// lib/library/image-describe.ts already refuses for this exact seam: sharp reaches 69 of
// check:og-trace's 100-function budget and 1510 MB of check:build-budget, and the event page fans
// out across the route table. Measuring by fetching the image header at render time means a blocking
// subrequest on a marquee page, in a repo tracking requests killed at Vercel's 300s ceiling
// (LIVE-124). A fit keyword costs nothing, cannot fail, and cannot time out.
//
// THE FOLLOW-UP THAT REMOVES THE TRADE ENTIRELY is to capture the aspect in the BROWSER at upload —
// the uploader has already decoded the file — and travel it to the server as a form field, exactly
// as lib/library/image-describe.ts does for blurhash and palette. Store it on the existing
// `events.theme` jsonb beside `coverFocus` (no migration), give this component an `aspect` prop, and
// the band becomes the poster's own shape: no bars, no crop, no letterbox, at either width. This
// component is shaped so that is a prop and a class, not a rewrite.

export function PosterBand({
  src,
  heightClass,
  radiusClass = 'rounded-2xl',
  widthClass = 'w-full',
  focus,
  alt = '',
  unoptimized = false,
  className = '',
}: {
  /** The cover's URL. Used twice: once as the poster, once as its own blurred backdrop. */
  src: string
  /** The band's height. Pass `posterHeightClass(tier)` — the shared ladder with a shorter phone
   *  half, which is what keeps the phone crop horizontal-safe (lib/layout/cover-height.ts). */
  heightClass: string
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
   *  🔴 THIS IS WHAT AIMS THE PHONE BAND. Below `sm` the band covers, so `object-position` decides
   *  which slice of the poster survives — and because the band is short and wide, that slice is
   *  vertical for every source narrower than 1.86:1. The picker's own hint ("Vertical matters most")
   *  is describing this crop.
   *
   *  ⚠️ From `sm` up it is nearly inert by design: the desktop band contains, so the whole poster
   *  fits and `object-position` only decides where it sits between its own blurred bars. */
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
    <div className={`relative ${heightClass} ${widthClass} overflow-hidden ${radiusClass} bg-surface-elevated ${className}`}>
      {/* THE BACKDROP, from `sm` up only — the width where the band contains and therefore has bars.
          The same image, scaled past the edges so the blur has pixels to work with all the way out
          (a blur samples beyond its own box and would otherwise fade to transparent at the frame),
          then dimmed so it stays clearly BEHIND the poster rather than competing with it.
          Decorative and inert: it is the poster again, so it carries nothing a reader needs and must
          never take a tap. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden scale-125 bg-cover bg-center opacity-45 blur-2xl sm:block"
        style={{ backgroundImage: `url("${src}")` }}
      />
      {/* THE POSTER. Full-bleed and covering on a phone, aimed by the host's focal point; whole,
          over its own wash, from `sm` up. */}
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 1024px) 100vw, 1344px"
        className="object-cover sm:object-contain"
        style={{ objectPosition: focus ?? undefined }}
        preload
        unoptimized={unoptimized}
      />
    </div>
  )
}
