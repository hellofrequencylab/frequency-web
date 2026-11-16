// WHAT THE CANVAS CAN ADD TO A PAGE, PRESETS FIRST (PROG-E6B). Server side: it reads the block registry. A preset
// is a block the page builder already offers, with starting words in it, so a person picks something that reads
// like a page before they pick an empty box. The blank blocks come second and are drawn from the Space page
// builder's own palette (profilePaletteForKind), never a second list: the blocks a person writes themselves.
// The sections that show a Space's live data (About, Offerings, Events and the rest) are not offered here yet,
// because whether a Space may place one depends on its data, which the Space page builder decides.
//
// The tab sends only an id. This module decides what that id holds, and the write sanitizes the content like any
// other, so a preset can never carry a field its block does not have. A block at its per-page limit stays listed,
// switched off, with the reason.

import { canPlaceType } from '@/lib/entity-blocks/node-ops'
import type { NodeLayout } from '@/lib/entity-blocks/node-tree'
import { profilePaletteForKind } from '@/lib/entity-blocks/registry'

interface CanvasPreset {
  id: string
  label: string
  /** One line on what it is for. */
  say: string
  type: string
  content: Record<string, unknown>
}

const CANVAS_PRESETS: readonly CanvasPreset[] = [
  { id: 'welcome', label: 'Welcome note', say: 'A headline, a few lines and a button.', type: 'callout', content: { title: 'Welcome in', body: 'Say who this Space is for and what happens here.', buttonLabel: 'See what is on' } },
  { id: 'big-title', label: 'Big title', say: 'A large heading that starts a new part of the page.', type: 'displayHeading', content: { text: 'What we do together' } },
  { id: 'short-story', label: 'Short story', say: 'A small label, a heading and a paragraph in your own words.', type: 'editorial', content: { eyebrow: 'Our story', title: 'How this started', body: 'Tell people how this began and why it matters to you.' } },
  { id: 'paragraph', label: 'Paragraph', say: 'Plain words, a few sentences long.', type: 'prose', content: { text: 'Write a few honest sentences about what people will find here.' } },
  { id: 'invitation', label: 'Invitation', say: 'A splash of color with one clear thing to do next.', type: 'accentBeat', content: { title: 'Come and see for yourself', body: 'Say what happens when someone says yes.', buttonLabel: 'Join us' } },
]

interface InserterOption {
  id: string
  label: string
  say?: string
  /** Set when the page cannot take one more of this block; `reason` says why. */
  disabled?: true
  reason?: string
}

/** The inserter as the client draws it: presets first, then the blank blocks. */
export interface CanvasInserterView {
  presets: InserterOption[]
  blanks: InserterOption[]
}

const AT_LIMIT = 'This page already has as many of these as it can hold.'
const limited = (layout: NodeLayout, type: string) => (canPlaceType(layout, type) ? {} : { disabled: true as const, reason: AT_LIMIT })
/** The blocks a person writes themselves: in the Space palette, not a live data section, behind no switch. */
const authored = () => profilePaletteForKind('space').filter((block) => block.category === 'content' && !block.requiresFunction)
const offered = () => new Set(authored().map((block) => block.id))

export function canvasInserterView(layout: NodeLayout): CanvasInserterView {
  const palette = authored()
  const types = offered()
  return {
    presets: CANVAS_PRESETS.filter((preset) => types.has(preset.type)).map(({ id, label, say, type }) => ({ id, label, say, ...limited(layout, type) })),
    blanks: palette.map((block) => ({ id: block.id, label: block.label, ...limited(layout, block.id) })),
  }
}

/** What an insert the tab asked for holds: a preset's block and starting content, or a blank block from the
 *  authored palette. Null for an id that is neither, or a block the canvas does not offer. */
export function resolveCanvasInsert(source: 'preset' | 'blank', id: string): { type: string; content?: Record<string, unknown> } | null {
  const types = offered()
  if (source === 'blank') return types.has(id) ? { type: id } : null
  const preset = CANVAS_PRESETS.find((candidate) => candidate.id === id)
  return preset && types.has(preset.type) ? { type: preset.type, content: { ...preset.content } } : null
}
