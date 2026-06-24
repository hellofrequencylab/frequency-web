import type { Data } from '@measured/puck'
import { config } from '@/lib/page-editor/config'
import { data as theLab } from './the-lab'
import { data as theCommunity } from './the-community'
import { data as theQuest } from './the-quest'
import { data as pricing } from './pricing'
import { data as lead } from './lead'
import { data as practice } from './practice'
import { data as spread } from './spread'

// Starter documents that re-create each editable page's content using the
// STANDARDIZED block library. They seed the editor when a page has no usable
// draft yet (or its stored draft predates the new blocks), so opening the editor
// always shows the page rebuilt from standard, design-system sections. Purely a
// code default — nothing is written to the database until the janitor Publishes.

const TEMPLATES: Record<string, Data> = {
  'the-lab': theLab,
  'the-community': theCommunity,
  'the-quest': theQuest,
  pricing,
  lead,
  practice,
  spread,
}

export function getTemplate(slug: string): Data | null {
  return TEMPLATES[slug] ?? null
}

// The set of block keys the current config knows how to render.
const KNOWN_BLOCKS = new Set(Object.keys(config.components))

// A stored document is "usable" only if it has content AND every block in it is
// still a known block type. Drafts authored against the retired block set fail
// this check, so the editor falls back to the standard-block template instead of
// trying to render unknown components.
export function isRenderable(data: unknown): data is Data {
  const content = (data as Data | null)?.content
  if (!Array.isArray(content) || content.length === 0) return false
  return content.every((b) => typeof b?.type === 'string' && KNOWN_BLOCKS.has(b.type))
}
