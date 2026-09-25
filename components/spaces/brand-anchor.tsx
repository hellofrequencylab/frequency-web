import { getInitials, cn } from '@/lib/utils'
import type { LogoBackdrop } from '@/app/(main)/spaces/[slug]/manage/layout/preferences'

// The brand LOGO chip in the Space profile identity lockup: the operator's logo, or a neutral initials chip.
// Decorative (alt=""): the <h1> beside it carries the name. Shared by the live (profile) layout hero and the
// public claim page so the two render the IDENTICAL chip (no drift).
//
// TWO image shapes flow through this ONE chip, told apart by file type (a CSS/URL signal, never pixel
// processing):
//   • A PHOTO avatar (a JPEG is always opaque) FILLS the chip edge-to-edge with object-cover, so it reads
//     FULL-BLEED — no letterbox bars, no white/black matting behind it.
//   • A LOGO (a PNG/WEBP/SVG/… can carry transparency) sits WHOLE on the plate with object-contain (never
//     cropped) PLUS a mode-aware contrast halo: a dark drop-shadow in light mode lifts a white logo off the
//     light plate, and a light one in dark mode lifts a dark logo off the dark plate — so a transparent logo
//     of either polarity stays visible in BOTH modes. The halo has no effect on an opaque photo.
// Fail-safe: an unknown or extensionless URL takes the logo path (contain — never crops), and a missing logo
// renders the neutral initials chip, never a crash. Query strings (?t=…) are tolerated.
//
// BACKDROP is the operator's separate, explicit choice (preferences.logoBackdrop), and it is orthogonal to
// the file-type split above: the type decides how the image FITS, the backdrop decides what is BEHIND it.
// 'plate' (default) is today's look; 'none' drops the plate for a mark drawn to sit on the photo itself.
// It is a toggle rather than alpha-sniffing on purpose — an extension says what a format CAN carry, never
// what an image DOES carry, and 8 of 21 live Spaces would have been changed by that guess. The reasoning
// is written out where the key is read (manage/layout/preferences.ts).
// SHAPE: `rounded-[var(--radius-cover,1.5rem)]`, the SAME token the cover photo beside it uses —
// not `--radius-card`. The chip and the cover are the two pieces of Space IDENTITY MEDIA, and the
// owner's directive (2026-09-01) is that both "should always be round for business Spaces". Riding
// the cover token is what makes that one fact instead of two that have to be kept in step: it used
// to be `rounded-card`, which agreed with the cover only because all six themes happened to set
// --radius-card and --radius-cover to the same value. That was coincidence, not contract, and the
// change that decoupled the cover from the theme would have silently desynchronised them.
// A theme still shapes everything else around it (cards, buttons, tabs) via --radius-card/-control.
//
// SIZE is the only thing a call site may vary, and it varies ONE thing: the box. 'hero' is the chip on
// the Space profile; 'card' is the same chip on a directory card, which used to be a hand-rolled copy in
// space-card.tsx that fit EVERY image with object-contain on an always-on plate. That copy letterboxed a
// photo avatar between white bars and drew a white square behind a transparent logo whose operator had
// explicitly chosen 'none' — the two defects the rules above exist to prevent, on the surface where a
// visitor meets a Space first. The fit rule, the halo, the backdrop and the radius are decided HERE, once,
// so the card and the profile cannot disagree about the same logo again.

/** The two boxes the chip is drawn at. Everything else about it — fit, halo, plate, radius — is the
 *  same at both sizes on purpose; only the geometry scales. */
export type BrandAnchorSize = 'hero' | 'card'

const SIZES: Record<BrandAnchorSize, { box: string; initials: string }> = {
  hero: { box: 'h-20 w-20 lg:h-28 lg:w-28', initials: 'text-page-title lg:text-3xl' },
  // 48px matches the inset (left-3 / bottom-3) the directory card already uses for its kind pill, so the
  // chip keeps the card's 12px edge rhythm — the same proportion the hero chip keeps against `p-6`.
  card: { box: 'h-12 w-12', initials: 'text-body-sm' },
}

export function BrandAnchor({
  name,
  logoUrl,
  backdrop = 'plate',
  size = 'hero',
}: {
  name: string
  logoUrl: string | null
  /** 'plate' (default) keeps the plate + ring + shadow; 'none' puts the logo bare on the cover.
   *  Operator-chosen per Space (preferences.logoBackdrop) — see the note above. */
  backdrop?: LogoBackdrop
  /** The box it is drawn at: 'hero' (the profile lockup, default) or 'card' (a directory card cover). */
  size?: BrandAnchorSize
}) {
  const dims = SIZES[size]
  const bare = backdrop === 'none'
  // The plate, the ring and the shadow are ONE decision and travel together. Dropping only the
  // background would leave a 4px `border-surface` ring drawing a white square around a logo that
  // asked for no square — the defect with an extra step.
  const plate = bare ? '' : 'border-4 border-surface bg-surface lift-1'
  if (logoUrl) {
    const isOpaquePhoto = /\.(jpe?g|jfif)(\?|$)/i.test(logoUrl)
    // The contrast halo is applied to EVERY format when bare, not just the logo path. Its usual job is
    // lifting a transparent mark off the plate; with no plate it is the only edge between the image and
    // the cover photo, and an opaque photo sitting directly on another photo needs that edge most.
    const halo = '[filter:drop-shadow(0_0_1px_var(--color-ink))] dark:[filter:drop-shadow(0_0_1px_var(--color-on-ink))]'
    return (
      // eslint-disable-next-line @next/next/no-img-element -- operator-supplied Space logo URL, not a build-time asset (matches BrandMark / SpaceCard)
      <img
        src={logoUrl}
        alt=""
        className={cn(
          'shrink-0 rounded-[var(--radius-cover,1.5rem)]',
          dims.box,
          plate,
          isOpaquePhoto ? 'object-cover' : 'object-contain',
          (bare || !isOpaquePhoto) && halo,
        )}
      />
    )
  }
  // The INITIALS fallback keeps its plate at both settings, and that is not an oversight. There is no
  // artwork here to be shown bare — the plate IS the chip, and `bg-surface-elevated` is what makes the
  // letters readable. A bare setting would render dark initials straight onto the cover photo, which is
  // the illegibility the halo exists to prevent, with no image to hang a halo on.
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-[var(--radius-cover,1.5rem)] border-4 border-surface bg-surface-elevated font-bold text-subtle lift-1',
        dims.box,
        dims.initials,
      )}
      aria-hidden
    >
      {getInitials(name)}
    </span>
  )
}
