// WHAT THE CANVAS CAN ADD TO A PAGE, PRESETS FIRST (PROG-E6B). Server side: it reads the block registry. A preset
// is a block the page builder already offers, with starting words in it, so a person picks something that reads
// like a page before they pick an empty box. The blank blocks come second and are drawn from the Space page
// builder's own palette (profilePaletteForKind), never a second list: the blocks a person writes themselves.
// The sections that show a Space's live data (About, Offerings, Events and the rest) come third (PROG-E6F), and
// only the ones the Space page builder's own lock rule lets this Space place (partitionSpaceBlocks with its
// switches and which sections have data, lib/builder/canvas-live-blocks.ts). The caller resolves that list; this
// module only draws it and checks an insert against it.
//
// The tab sends only an id. This module decides what that id holds, and the write sanitizes the content like any
// other, so a preset can never carry a field its block does not have. A block at its per-page limit stays listed,
// switched off, with the reason.

import { canPlaceType } from '@/lib/entity-blocks/node-ops'
import type { NodeLayout } from '@/lib/entity-blocks/node-tree'
import { profilePaletteForKind } from '@/lib/entity-blocks/registry'
import type { InsertSource } from './canvas-tree'

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

/** The inserter as the client draws it: presets first, then the blank blocks, then the Space's live sections. */
export interface CanvasInserterView {
  presets: InserterOption[]
  blanks: InserterOption[]
  /** The sections that show this Space's live data and that it may place now (PROG-E6F). */
  live?: InserterOption[]
}

const AT_LIMIT = 'This page already has as many of these as it can hold.'
const limited = (layout: NodeLayout, type: string) => (canPlaceType(layout, type) ? {} : { disabled: true as const, reason: AT_LIMIT })
/** The blocks a person writes themselves: in the Space palette, not a live data section, behind no switch. */
const authored = () => profilePaletteForKind('space').filter((block) => block.category === 'content' && !block.requiresFunction)
const offered = () => new Set(authored().map((block) => block.id))
/** The live sections in the Space palette, in its order: data blocks, not written by hand. */
export const liveSections = () => profilePaletteForKind('space').filter((block) => block.category === 'data')

/** `liveIds` are the live sections this Space may place now, as the caller resolved them; anything else is
 *  never offered, whatever the list holds. */
export function canvasInserterView(layout: NodeLayout, liveIds: readonly string[] = []): CanvasInserterView {
  const palette = authored()
  const types = offered()
  const allowed = new Set(liveIds)
  return {
    presets: CANVAS_PRESETS.filter((preset) => types.has(preset.type)).map(({ id, label, say, type }) => ({ id, label, say, ...limited(layout, type) })),
    blanks: palette.map((block) => ({ id: block.id, label: block.label, ...limited(layout, block.id) })),
    ...(allowed.size ? { live: liveSections().filter((block) => allowed.has(block.id)).map((block) => ({ id: block.id, label: block.label, say: block.description, ...limited(layout, block.id) })) } : {}),
  }
}

/** What an insert the tab asked for holds: a preset's block and starting content, a blank block from the
 *  authored palette, or a live section this Space may place (`liveIds`, resolved by the caller on this request).
 *  Null for an id that is none of those, or a block the canvas does not offer. */
export function resolveCanvasInsert(source: InsertSource, id: string, liveIds: readonly string[] = []): { type: string; content?: Record<string, unknown> } | null {
  const types = offered()
  if (source === 'live') return liveIds.includes(id) && liveSections().some((block) => block.id === id) ? { type: id } : null
  if (source === 'blank') return types.has(id) ? { type: id } : null
  const preset = CANVAS_PRESETS.find((candidate) => candidate.id === id)
  return preset && types.has(preset.type) ? { type: preset.type, content: { ...preset.content } } : null
}
