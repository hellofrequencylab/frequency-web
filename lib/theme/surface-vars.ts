// The shape of a Mega Theme's ground and the scoped --color-* override it paints (lib/theme/surface.ts holds
// the resolvers). Kept apart and import-free so AccentScope reads it without pulling the theme modules. PURE.

export interface ThemeSurface {
  /** A dark ground. Drives color-scheme and the email's dark-aware brand shades. */
  dark: boolean
  canvas: string
  raised: string
  elevated: string
  border: string
  text: string
  muted: string
  subtle: string
  /** The solid button's fill and the label that reads on it. */
  solid: string
  onSolid: string
  /** The theme's own accent family (literal hex). A Space's picked accent still wins over it. */
  accent: { accent: string; text: string; on: string; bg: string }
  /** The semantic notes that read on this ground. */
  semantic: { success: string; info: string; danger: string }
}

/** The scoped token override a themed Space page paints on one node. Tokens the app already reads. */
export function surfaceCssVars(s: ThemeSurface): Record<string, string> {
  return {
    colorScheme: s.dark ? 'dark' : 'light',
    background: 'var(--color-canvas)',
    color: 'var(--color-text)',
    '--color-canvas': s.canvas,
    '--color-surface': s.raised,
    '--color-surface-post': s.raised,
    '--color-surface-elevated': s.elevated,
    '--color-surface-hover': s.elevated,
    '--color-border': s.border,
    '--color-text': s.text,
    '--color-text-muted': s.muted,
    '--color-text-subtle': s.subtle,
    '--color-ink': s.solid,
    '--color-on-ink': s.onSolid,
  }
}
