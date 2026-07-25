import { getInitials, cn } from '@/lib/utils'

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
export function BrandAnchor({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  if (logoUrl) {
    const isOpaquePhoto = /\.(jpe?g|jfif)(\?|$)/i.test(logoUrl)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- operator-supplied Space logo URL, not a build-time asset (matches BrandMark / SpaceCard)
      <img
        src={logoUrl}
        alt=""
        className={cn(
          'h-20 w-20 shrink-0 rounded-2xl border-4 border-surface bg-surface shadow-md lg:h-28 lg:w-28',
          isOpaquePhoto
            ? 'object-cover'
            : 'object-contain [filter:drop-shadow(0_0_1px_var(--color-ink))] dark:[filter:drop-shadow(0_0_1px_var(--color-on-ink))]',
        )}
      />
    )
  }
  return (
    <span
      className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border-4 border-surface bg-surface-elevated text-2xl font-bold text-subtle shadow-md lg:h-28 lg:w-28 lg:text-3xl"
      aria-hidden
    >
      {getInitials(name)}
    </span>
  )
}
