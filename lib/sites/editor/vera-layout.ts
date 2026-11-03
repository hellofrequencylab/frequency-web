// VERA'S LAYOUT CHANGES IN THE WEBSITE EDITOR (LIVE-2083; the Web Assistant plan in
// /mnt/project-files/vera-assistants-2026-11-03/REPORT.md, BLD-402's first slice on the live editor).
//
// A plain-words ask ("put my story first and hide the contact form on phones") becomes a LIST OF PROPOSED
// CHANGES in the closed vocabulary below. The calendar's Vera is the model (lib/calendar/vera-command.ts):
// the model proposes, the person ticks lines, and only ticked lines are applied, to the DRAFT, as ONE undo
// step. Nothing here publishes: Publish stays a human button with no tool behind it.
//
// THE AUTHORSHIP LINE IS STRUCTURAL. No change kind carries words. Vera can move, show, hide, duplicate and
// restyle a section within the theme's own tone and width options; she cannot write or rewrite a heading, a
// body, a button or any other text (owner ruling 2026-11-02, BLD-000 #1). A model reply that tries to set
// text is refused line by line with a reason, never silently dropped.
//
// THE THEME BOUNDARY IS STRUCTURAL TOO. Tone and width are closed enums the section renderer already reads
// (lib/sites/editor/state.ts sectionDisplay); there is no colour, font or CSS value anywhere in this file.
//
// PURE: no React, no IO. The server action builds the prompt from `websiteVeraOutline` and parses the reply
// against the outline's ids; the editor re-parses the same reply against its own document before applying,
// because the reply crosses the network and is untrusted both ways.

import type { Config, Data } from '@/lib/page-editor/types'
import { buildOutline, findBlockDeep, moveBlockTo } from '@/components/page-editor/mobile/data-ops'
import { duplicateWebsiteSection } from './duplicate'
import { patchSectionBase, sectionDisplay, sectionVisibility, setSectionVisibility, type Device } from './state'

/** The section tones and widths the renderer reads. Kept in lock-step with state.ts by test. */
export const VERA_SECTION_TONES = ['white', 'sand', 'pastel', 'ink'] as const
export const VERA_SECTION_WIDTHS = ['narrow', 'default', 'wide', 'full'] as const
const DEVICES: readonly Device[] = ['desktop', 'tablet', 'phone']

/** Most lines one proposal may carry: enough to restructure a page, few enough to read before ticking. */
export const MAX_VERA_LAYOUT_CHANGES = 12

export type WebsiteVeraChange =
  | { kind: 'move'; sectionId: string; toPosition: number }
  | { kind: 'visibility'; sectionId: string; device: Device; visible: boolean }
  | { kind: 'duplicate'; sectionId: string }
  | { kind: 'tone'; sectionId: string; tone: (typeof VERA_SECTION_TONES)[number] }
  | { kind: 'width'; sectionId: string; width: (typeof VERA_SECTION_WIDTHS)[number] }

/** One top-level section as Vera reads it. `summary` is the owner's own text, sent as DATA, never as an instruction. */
export interface WebsiteVeraSection {
  id: string
  type: string
  label: string
  summary: string
  position: number
  tone: string | null
  width: string | null
  shows: Record<Device, boolean>
}

export function websiteVeraOutline(doc: Data, config: Config): WebsiteVeraSection[] {
  return buildOutline(doc, config).slice(0, 60).map((node, index) => {
    const base = sectionDisplay(doc, node.id, 'desktop')
    return {
      id: node.id,
      type: node.type,
      label: node.label.slice(0, 80),
      summary: node.summary && node.summary !== node.label ? node.summary.slice(0, 120) : '',
      position: index + 1,
      tone: base.tone ?? null,
      width: base.width ?? null,
      shows: sectionVisibility(doc, node.id),
    }
  })
}

/** Keys a change may carry. Anything else (text, heading, props, css) is refused, not ignored. */
const ALLOWED_KEYS = new Set(['kind', 'sectionId', 'toPosition', 'device', 'visible', 'tone', 'width'])
const WORD_KEYS = /^(text|title|heading|headline|body|copy|label|button|caption|description|subtitle|value|content|props)$/i
const AUTHORSHIP_REFUSAL = 'Vera does not write or rewrite your words, so that line was left out. Select the text and ask for coaching questions instead.'

type ParsedVeraLayout = { changes: WebsiteVeraChange[]; refused: string[] }

/**
 * Parse an untrusted proposal (`{ changes: [...] }`) against the section ids that exist on this page. Every
 * line either becomes a typed change or a plain refusal the person can read; nothing is dropped silently.
 */
export function parseWebsiteVeraLayout(raw: unknown, sectionIds: ReadonlySet<string>): ParsedVeraLayout {
  const out: ParsedVeraLayout = { changes: [], refused: [] }
  const list = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { changes?: unknown }).changes : undefined
  if (!Array.isArray(list)) return out
  if (list.length > MAX_VERA_LAYOUT_CHANGES) out.refused.push(`Only the first ${MAX_VERA_LAYOUT_CHANGES} changes were kept. Ask again for the rest.`)
  list.slice(0, MAX_VERA_LAYOUT_CHANGES).forEach((line, i) => {
    const at = `Change ${i + 1}`
    if (!line || typeof line !== 'object' || Array.isArray(line)) { out.refused.push(`${at} was not a change Vera can make.`); return }
    const o = line as Record<string, unknown>
    const keys = Object.keys(o)
    if (keys.some((k) => WORD_KEYS.test(k))) { out.refused.push(`${at}: ${AUTHORSHIP_REFUSAL}`); return }
    if (keys.some((k) => !ALLOWED_KEYS.has(k))) { out.refused.push(`${at} carried a setting Vera cannot change here.`); return }
    const sectionId = typeof o.sectionId === 'string' ? o.sectionId : ''
    if (!sectionIds.has(sectionId)) { out.refused.push(`${at} named a section that is not on this page.`); return }
    switch (o.kind) {
      case 'move': {
        const to = typeof o.toPosition === 'number' && Number.isInteger(o.toPosition) ? o.toPosition : NaN
        if (!(to >= 1 && to <= sectionIds.size)) { out.refused.push(`${at} moved a section to a position the page does not have.`); return }
        out.changes.push({ kind: 'move', sectionId, toPosition: to }); return
      }
      case 'visibility': {
        if (!DEVICES.includes(o.device as Device) || typeof o.visible !== 'boolean') { out.refused.push(`${at} needs a device (desktop, tablet or phone) and show or hide.`); return }
        out.changes.push({ kind: 'visibility', sectionId, device: o.device as Device, visible: o.visible }); return
      }
      case 'duplicate':
        out.changes.push({ kind: 'duplicate', sectionId }); return
      case 'tone': {
        if (!(VERA_SECTION_TONES as readonly unknown[]).includes(o.tone)) { out.refused.push(`${at} asked for a background your theme does not offer.`); return }
        out.changes.push({ kind: 'tone', sectionId, tone: o.tone as (typeof VERA_SECTION_TONES)[number] }); return
      }
      case 'width': {
        if (!(VERA_SECTION_WIDTHS as readonly unknown[]).includes(o.width)) { out.refused.push(`${at} asked for a width your theme does not offer.`); return }
        out.changes.push({ kind: 'width', sectionId, width: o.width as (typeof VERA_SECTION_WIDTHS)[number] }); return
      }
      default:
        out.refused.push(`${at} is a kind of change Vera cannot make here.`)
    }
  })
  return out
}

const DEVICE_WORD: Record<Device, string> = { desktop: 'on desktop', tablet: 'on tablet', phone: 'on phones' }

function sectionName(doc: Data, config: Config, id: string): string {
  const block = findBlockDeep(doc, config, id)
  return block ? String(config.components[block.type]?.label ?? block.type) : 'A section'
}

/** The line a person reads before ticking. Every kind here is undone by the editor's Undo while it is a draft. */
export function describeWebsiteVeraChange(change: WebsiteVeraChange, doc: Data, config: Config): string {
  const name = sectionName(doc, config, change.sectionId)
  switch (change.kind) {
    case 'move': return `Move ${name} to position ${change.toPosition}`
    case 'visibility': return `${change.visible ? 'Show' : 'Hide'} ${name} ${DEVICE_WORD[change.device]}`
    case 'duplicate': return `Duplicate ${name} (the copy keeps your words)`
    case 'tone': return `Give ${name} the ${change.tone} background`
    case 'width': return `Set ${name} to ${change.width} width`
  }
}

type VeraLayoutResult = { change: WebsiteVeraChange; ok: boolean; line: string }

/** Apply the ticked changes in order to a page document. Each line reports on its own; a miss never hides another. */
export function applyWebsiteVeraLayout(doc: Data, config: Config, changes: WebsiteVeraChange[]): { doc: Data; results: VeraLayoutResult[] } {
  let next = doc
  const results: VeraLayoutResult[] = []
  for (const change of changes) {
    const line = describeWebsiteVeraChange(change, next, config)
    const index = next.content.findIndex((b) => b.props.id === change.sectionId)
    if (index < 0) { results.push({ change, ok: false, line: `${line}: that section is no longer on the page` }); continue }
    const before = next
    switch (change.kind) {
      case 'move': next = moveBlockTo(next, config, change.sectionId, { parentId: null, slotKey: null, index: Math.min(change.toPosition - 1, next.content.length - 1) }); break
      case 'visibility': next = setSectionVisibility(next, change.sectionId, change.device, change.visible); break
      case 'duplicate': next = duplicateWebsiteSection(next, config, change.sectionId).data; break
      case 'tone': next = patchSectionBase(next, change.sectionId, { tone: change.tone }); break
      case 'width': next = patchSectionBase(next, change.sectionId, { width: change.width }); break
    }
    const ok = next !== before || (change.kind === 'move' && index === change.toPosition - 1)
    results.push({ change, ok, line: ok ? line : `${line}: the page could not take that change` })
  }
  return { doc: next, results }
}
