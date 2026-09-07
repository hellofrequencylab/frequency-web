import type { CSSProperties, ReactNode } from 'react'
import { type AccentVars } from '@/lib/spaces/accent'
import { type SpaceThemeId } from '@/lib/theme/space-themes'

// ACCENT SCOPE — the wrapper that paints a Space's brand accent over its profile subtree
// (ENTITY-SPACES-BUILD §A, D4 "the accent is a guest" / D6 "tokens only"). It sets the
// `--color-primary*` family as a SCOPED inline CSS-variable override on one node, so every
// `bg-primary` CTA, the active tab, the type badge, and the in-body `text-primary-strong` accents
// inside it carry the Space's color automatically — while the canvas/surface tokens stay neutral
// (the brand never repaints the whole page). The values are built by lib/spaces/accent.ts: for a
// TOKEN accent, `var(--allowlisted-token)` strings that track the live palette + dark mode; for a HEX
// accent (ADR-516 D2), the hex, `color-mix` shades, and a per-theme `light-dark()` pair for the
// `-strong` text slot (LIVE-211) that the browser resolves from the mode's `color-scheme`.
//
// Server-friendly (no hooks): it renders a plain element with an inline `style`. When `vars` is null
// (no Space accent and no role default) it renders its children untouched, so the host amber stands.

export function AccentScope({
  vars,
  theme,
  className,
  children,
}: {
  /** The resolved `--color-primary*` override (lib/spaces/accent.ts), or null to inherit the host. */
  vars: AccentVars | null
  /** The Space page THEME id (ADR-578, lib/theme/space-themes.ts). Emitted as `data-space-theme` so the
   *  `[data-space-theme="<id>"]` CSS block themes the typography + shape of this Space subtree. Omitted
   *  (or 'bold', the no-op default) leaves the render unchanged.
   *
   *  🔴 TYPED, NOT `string` (LIVE-196, ADR-1192). Every id here must have a matching
   *  `[data-space-theme="<id>"]` block in app/globals.css, and the attribute is emitted verbatim — so a
   *  loose `string` let a typo render a live attribute matching no CSS block, silently dropping the
   *  Space's typography with nothing to notice. `parseSpaceTheme` already returns this union; taking it
   *  here is what makes the guarantee reach the DOM. */
  theme?: SpaceThemeId
  className?: string
  children: ReactNode
}) {
  // The AccentVars keys are CSS custom properties; React types CSSProperties without an index
  // signature for `--*`, so cast through the documented custom-property style shape.
  const style = (vars ?? undefined) as CSSProperties | undefined
  return (
    <div className={className} style={style} data-space-theme={theme}>
      {children}
    </div>
  )
}
