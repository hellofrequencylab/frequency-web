import type { PillarSlug } from '@/lib/pillars'

// The four Pillars, display order + label. Member-facing copy capitalizes each Pillar
// as a proper noun (Mind / Body / Spirit / Expression). Pure constant — server-safe,
// shared by the Circle Templates index grouping and the editor's Pillar selector.

export const PILLAR_ORDER: readonly PillarSlug[] = ['mind', 'body', 'spirit', 'expression']

export const PILLAR_LABEL: Record<PillarSlug, string> = {
  mind: 'Mind',
  body: 'Body',
  spirit: 'Spirit',
  expression: 'Expression',
}
