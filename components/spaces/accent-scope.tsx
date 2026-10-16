import type { CSSProperties, ReactNode } from 'react'
import { type AccentVars, type FrequencyAccentVars } from '@/lib/spaces/accent'
import { type SpaceThemeId } from '@/lib/theme/space-themes'
import { LEGACY_THEME_AXES } from '@/lib/theme/design'
import { SITE_FACE_SHEETS, SITE_FACE_VARS, type SiteFacesId } from '@/lib/theme/site-faces'

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
  fqAccent,
  siteFaces,
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
  /** The Space's own accent in the Frequency design's slots (lib/spaces/accent.ts frequencyAccentVars),
   *  applied only when the design owns the `--color-primary*` family. Null keeps the iridescent fill. */
  fqAccent?: FrequencyAccentVars | null
  /** The website theme's own faces (lib/theme/site-faces.ts), when the Space page is synced to a website
   *  theme that carries faces no font set has. Frequency only; it replaces the stand-in font set. */
  siteFaces?: SiteFacesId | null
  className?: string
  children: ReactNode
}) {
  // The AccentVars keys are CSS custom properties; React types CSSProperties without an index
  // signature for `--*`, so cast through the documented custom-property style shape.
  //
  // Under a design that overrides everything (Frequency, ADR-1737) the `--color-primary*` override does
  // not apply: it re-points tokens the design owns. The Space's OWN accent still paints (SCAN-979, owner
  // 2026-10-16): it rides `fqAccent`, three `--space-accent*` names that app/themes/frequency/space-page.css
  // maps onto the design's fill under `data-space-accent`. Its FONT SET does too (owner ruling, 2026-10-13: a Space picks its primary
  // fonts in its theme, never per heading). It rides `data-space-fonts`, which only
  // app/themes/frequency/space-page.css reads, and only for a set other than the house default.
  const fqVars = !LEGACY_THEME_AXES ? (fqAccent ?? undefined) : undefined
  const faces = !LEGACY_THEME_AXES && siteFaces ? siteFaces : null
  const base = LEGACY_THEME_AXES ? (vars ?? undefined) : fqVars
  const style = (faces ? { ...base, ...SITE_FACE_VARS[faces] } : base) as CSSProperties | undefined
  const fqFonts = faces ?? (!LEGACY_THEME_AXES && theme && theme !== 'frequency' ? theme : undefined)
  return (
    <div
      className={className}
      style={style}
      data-space-theme={LEGACY_THEME_AXES ? theme : undefined}
      data-space-fonts={fqFonts}
      data-space-accent={fqVars ? '' : undefined}
    >
      {faces && <link rel="stylesheet" href={SITE_FACE_SHEETS[faces]} precedence="default" />}
      {children}
    </div>
  )
}
