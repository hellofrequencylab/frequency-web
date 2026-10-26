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
    // The Frequency design owns its own ground and text names; the same surface, on its tokens.
    '--fq-bg-canvas': s.canvas,
    '--fq-bg-sunken': s.canvas,
    '--fq-surface-card': s.raised,
    '--fq-surface-raised': s.elevated,
    '--fq-surface-glass': `color-mix(in oklab, ${s.raised} 74%, transparent)`,
    '--fq-text-strong': s.text,
    '--fq-text-body': s.text,
    '--fq-text-muted': s.muted,
    '--fq-text-faint': s.subtle,
    '--fq-text-on-accent': s.accent.on,
    '--fq-border-hair': `color-mix(in oklab, ${s.text} 10%, transparent)`,
    '--fq-border-strong': `color-mix(in oklab, ${s.text} 22%, transparent)`,
  }
}
