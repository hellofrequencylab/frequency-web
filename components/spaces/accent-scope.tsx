import type { CSSProperties, ReactNode } from 'react'
import { type AccentVars } from '@/lib/spaces/accent'

// ACCENT SCOPE — the wrapper that paints a Space's brand accent over its profile subtree
// (ENTITY-SPACES-BUILD §A, D4 "the accent is a guest" / D6 "tokens only"). It sets the
// `--color-primary*` family as a SCOPED inline CSS-variable override on one node, so every
// `bg-primary` CTA, the active tab, the type badge, and the in-body `text-primary-strong` accents
// inside it carry the Space's color automatically — while the canvas/surface tokens stay neutral
// (the brand never repaints the whole page). The values are `var(--allowlisted-token)` strings built
// by lib/spaces/accent.ts (never a hex), so they track the live palette + dark mode.
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
   *  `[data-space-theme="<id>"]` CSS block themes the typography + shape of this profile subtree. Omitted
   *  (or 'bold', the no-op default) leaves the render unchanged. */
  theme?: string
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
