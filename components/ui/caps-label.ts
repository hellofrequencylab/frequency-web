import { cn } from '@/lib/utils'

// THE SMALL UPPERCASE LABEL — one source for the role ~250 components hand-rolled as
// `text-2xs font-semibold uppercase tracking-wide text-muted` (a field caption over a value, a
// table head, a group label in a menu, a stat's name).
//
// 🔴 THIS IS NOT THE `eyebrow` ROLE, and converting one into the other is not a free swap. The
// `eyebrow` utility (app/globals.css) is the locked kicker ABOVE a heading: grotesk face, bold,
// 0.18em tracking. The caps label is quieter on every axis — the reading face, the call site's
// own weight, and Tailwind's `tracking-wide` (0.025em) — and the product draws both on purpose.
// Repainting the labels as eyebrows would push every one of them seven times wider apart.
//
// WHY A HELPER RATHER THAN LEAVING THE LITERAL. The design switch (ADR-1737) needs every visual
// decision to live in a place one change can reach. A label whose case and tracking are spelled
// out in 250 files can only follow a new design through 250 edits; one that composes this helper
// follows it through one. The case and tracking are the role. Size, weight and colour stay with
// the caller, because they genuinely differ by context and `cn` is a plain join — a default here
// would land BESIDE a caller's override rather than replacing it, and Tailwind's emit order, not
// the call site, would pick the winner.
//
//   <dt className={capsLabel('text-2xs font-semibold text-muted')}>Visibility</dt>
//   <th className={capsLabel('text-meta text-subtle', 'wider')}>Name</th>

/** How far apart the letters sit. `wide` is the label default; the wider two are the
 *  quieter all-caps markers (a badge, a timestamp header) that already used them. */
export type CapsTracking = 'wide' | 'wider' | 'widest'

const TRACKING: Record<CapsTracking, string> = {
  wide: 'tracking-wide',
  wider: 'tracking-wider',
  widest: 'tracking-widest',
}

/** The caps-label role (uppercase + its tracking), plus the caller's size, weight and colour. */
export function capsLabel(className?: string, tracking: CapsTracking = 'wide'): string {
  return cn('uppercase', TRACKING[tracking], className)
}
