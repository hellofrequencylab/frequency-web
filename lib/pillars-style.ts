import type { PillarSlug } from '@/lib/pillars'

// The locked Pillar palette as semantic-token class pairs: mind→info, body→success,
// spirit→primary, expression→signal (AGENTS.md). PURE design tokens with no server
// imports (only a type import from lib/pillars), so this is safe to pull into client
// components and the page-editor blocks. One source of truth for Pillar tinting.
export const PILLAR_TINT: Record<PillarSlug, string> = {
  mind: 'bg-info-bg text-info',
  body: 'bg-success-bg text-success',
  spirit: 'bg-primary-bg text-primary-strong',
  expression: 'bg-signal-bg text-signal-strong',
}

/** Pillar slug → its [bg, text] token pair; a neutral surface chip for anything unrecognised. */
export function pillarTint(slug: string | null | undefined): string {
  return (slug && PILLAR_TINT[slug as PillarSlug]) || 'bg-surface-elevated text-muted'
}
