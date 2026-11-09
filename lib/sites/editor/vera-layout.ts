// VERA'S LAYOUT CHANGES IN THE WEBSITE EDITOR (LIVE-2097; the Web Assistant plan in
// /mnt/project-files/vera-assistants-2026-11-03/REPORT.md, BLD-402's first slice on the live editor).
//
// A plain-words ask ("put my story first and hide the contact form on phones") becomes a LIST OF PROPOSED
// CHANGES in the closed vocabulary below. The calendar's Vera is the model (lib/calendar/vera-command.ts):
// the model proposes, the person ticks lines, and only ticked lines are applied, to the DRAFT, as ONE undo
// step. Nothing here publishes: Publish stays a human button with no tool behind it.
//
// THE AUTHORSHIP LINE IS STRUCTURAL. No change kind carries words. Vera can move, show, hide, duplicate, add (LIVE-2135) and
// restyle a section within the theme's own tone and width options; she cannot write or rewrite a heading, a
// body, a button or any other text (owner ruling 2026-11-02, BLD-000 #1). A model reply that tries to set
// text is refused line by line with a reason, never silently dropped.
//
// THE THEME BOUNDARY IS STRUCTURAL TOO. Tone and width are closed enums the section renderer already reads
// (lib/sites/editor/state.ts sectionDisplay); there is no colour, font or CSS value anywhere in this file.
//
// EVERY DESIGN CHOICE THE EDITOR OFFERS (LIVE-2162, owner ask 2026-11-04 05:40Z "any theme styles and layout"): the
// Design tab's own section settings (align, spacing steps, columns, reveal, the theme's heading and body fonts) as
// closed lists below, and each block's own design options (a radio or select field, like a card's Accent surface)
// read from the block config itself and sent on the menu, so Vera can pick only an option the owner could click.
// A field that holds words, a link or an id is never offered.
//
// PURE: no React, no IO. The server action builds the prompt from `websiteVeraOutline` and parses the reply
// against the outline's ids; the editor re-parses the same reply against its own document before applying,
// because the reply crosses the network and is untrusted both ways.

import type { Config, Data } from '@/lib/page-editor/types'
import { addBlock, buildOutline, findBlockDeep, moveBlockTo } from '@/components/page-editor/mobile/data-ops'
import { duplicateWebsiteSection } from './duplicate'
import { patchSectionBase, sectionDisplay, sectionVisibility, setSectionVisibility, updateSectionDisplay, type Device, type SectionDisplay } from './state'

/** The section tones and widths the renderer reads. Kept in lock-step with state.ts by test. */
export const VERA_SECTION_TONES = ['white', 'sand', 'pastel', 'ink'] as const
export const VERA_SECTION_WIDTHS = ['narrow', 'default', 'wide', 'full'] as const
const DEVICES: readonly Device[] = ['desktop', 'tablet', 'phone']

/** The Design tab's section settings (components/sites/editor/inspector.tsx), as closed lists. `theme` clears the
 *  setting so the theme's own value shows again, exactly as the tab's reset does. Spacing steps are the tab's own. */
export const VERA_DESIGN_SETTINGS = {
  align: { label: 'alignment', choices: ['left', 'center', 'right'] },
  spacing: { label: 'space above and below', choices: ['theme', 'tight', 'snug', 'default', 'roomy'] },
  columns: { label: 'columns', choices: ['theme', '1', '2', '3', '4'] },
  reveal: { label: 'reveal on scroll', choices: ['none', 'fade', 'rise'] },
  headingFont: { label: 'heading font', choices: ['theme', 'display', 'body', 'mono'] },
  bodyFont: { label: 'body font', choices: ['theme', 'display', 'body', 'mono'] },
} as const
type DesignSetting = keyof typeof VERA_DESIGN_SETTINGS
const DESIGN_PAD: Record<string, number> = { tight: 32, snug: 56, default: 88, roomy: 120 }
const isDesignSetting = (v: unknown): v is DesignSetting => typeof v === 'string' && Object.hasOwn(VERA_DESIGN_SETTINGS, v)

/** Most lines one proposal may carry: enough to restructure a page, few enough to read before ticking. */
export const MAX_VERA_LAYOUT_CHANGES = 12

/** A change to one section of the page in view. */
type WebsiteVeraSectionChange =
  | { kind: 'move'; sectionId: string; toPosition: number }
  | { kind: 'visibility'; sectionId: string; device: Device; visible: boolean }
  | { kind: 'duplicate'; sectionId: string }
  | { kind: 'tone'; sectionId: string; tone: (typeof VERA_SECTION_TONES)[number] }
  | { kind: 'width'; sectionId: string; width: (typeof VERA_SECTION_WIDTHS)[number] }
  | { kind: 'design'; sectionId: string; setting: DesignSetting; choice: string }
  | { kind: 'option'; sectionId: string; field: string; choice: string }

/** A change to the whole site's style on this draft: one of the theme's own dials, accents or Looks. */
type WebsiteVeraStyleChange =
  | { kind: 'style'; dial: string; option: string }
  | { kind: 'accent'; accent: string }
  | { kind: 'look'; look: string }

/** A new section of a kind the Add tab offers on this page (LIVE-2135). It arrives with the block's own placeholder
 *  prompts ("Your headline goes here"), exactly as the Add tab inserts it; Vera never fills in words. */
type WebsiteVeraAddChange = { kind: 'add'; blockType: string; toPosition: number }

export type WebsiteVeraChange = WebsiteVeraSectionChange | WebsiteVeraStyleChange | WebsiteVeraAddChange

/** The sections the Add tab offers on this page right now (not at a per-page cap), by block type and label. */
type WebsiteVeraAddable = { type: string; label: string }[]

const STYLE_KINDS = new Set(['style', 'accent', 'look'])
const isWebsiteVeraStyleChange = (change: WebsiteVeraChange): change is WebsiteVeraStyleChange => STYLE_KINDS.has(change.kind)

/**
 * THE THEME'S OWN MENU (LIVE-2098): exactly the dials, accents and Looks the editor's Style panel offers for the
 * theme the draft wears, built in the browser from the same registry the panel draws from. Vera can only pick from
 * it, so every style she proposes is one the owner could have clicked; there is no colour, font or CSS anywhere.
 * `own` is the theme's value for the dial: picking it stores nothing, exactly as the panel does.
 */
export interface WebsiteVeraStyleMenu {
  dials: { id: string; label: string; options: { id: string; label: string }[]; current: string; own: string }[]
  accents: { id: string; label: string }[]
  accent: string | null
  looks: { id: string; label: string; dials: Record<string, string> }[]
  /** LIVE-2135: the sections the Add tab offers on the page in view. The same rule as the style lines: Vera adds only
   *  what the owner could have clicked. Absent means no adds. */
  sections?: WebsiteVeraAddable
  /** LIVE-2162: each section's own design options on the page in view (websiteVeraBlockOptions). Absent means none. */
  options?: WebsiteVeraBlockOption[]
}

/** One design option a section's block offers in its own panel: a radio or select field with fixed choices. */
interface WebsiteVeraBlockOption {
  sectionId: string
  field: string
  label: string
  current: string
  choices: { id: string; label: string }[]
}

/** Fields that hold words, a link, a picture, an id, an embed source or search markup: never a design option,
 *  whatever their field type. */
const SECTION_ID = /^[^\s]{1,120}$/
const NOT_DESIGN = /(text|title|heading|headline|body|copy|label|caption|description|subtitle|eyebrow|quote|name|href|url|link|email|phone|image|photo|src|slug|provider|schema|^id$|ids$)/i
const CHOICE = /^[A-Za-z0-9_.-]{1,40}$/

type FieldDef = { type?: unknown; label?: unknown; options?: unknown }
function choiceField(config: Config, type: string, field: string): { label: string; options: { label: string; value: unknown }[] } | null {
  const def = (config.components[type]?.fields as Record<string, FieldDef> | undefined)?.[field]
  if (!def || (def.type !== 'radio' && def.type !== 'select') || NOT_DESIGN.test(field) || !Array.isArray(def.options)) return null
  const options = (def.options as { label?: unknown; value?: unknown }[]).filter((o) => o && ['string', 'number', 'boolean'].includes(typeof o.value) && CHOICE.test(String(o.value)))
  return options.length >= 2 && options.length <= 12 ? { label: String(def.label ?? field).slice(0, 60), options: options.map((o) => ({ label: String(o.label ?? o.value).slice(0, 60), value: o.value })) } : null
}

/** Every design option the page's sections offer in their own panels, read from the block config (LIVE-2162). */
export function websiteVeraBlockOptions(doc: Data, config: Config): WebsiteVeraBlockOption[] {
  const out: WebsiteVeraBlockOption[] = []
  for (const block of doc.content.slice(0, 60)) {
    const sectionId = String(block.props.id ?? '')
    for (const field of Object.keys(config.components[block.type]?.fields ?? {})) {
      const def = choiceField(config, block.type, field)
      if (!def || !SECTION_ID.test(sectionId) || out.length >= 120) continue
      const now = (block.props as Record<string, unknown>)[field]
      out.push({ sectionId, field, label: def.label, current: now === undefined ? '' : String(now).slice(0, 40), choices: def.options.map((o) => ({ id: String(o.value), label: o.label })) })
    }
  }
  return out
}

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
  /** LIVE-2162: the Design tab settings this section has set (absent ones use the theme). */
  design?: Partial<Record<DesignSetting, string>>
}

/** The Design tab settings a section has set, in Vera's words (the inverse of applyDesign). */
function designNow(d: SectionDisplay): Partial<Record<DesignSetting, string>> {
  const pad = d.padding === undefined ? undefined : Object.entries(DESIGN_PAD).reduce((best, [k, px]) => (Math.abs(px - d.padding!) < Math.abs(DESIGN_PAD[best] - d.padding!) ? k : best), 'default')
  return Object.fromEntries(Object.entries({ align: d.align, spacing: pad, columns: d.columns === undefined ? undefined : String(d.columns), reveal: d.animation, headingFont: d.textFont, bodyFont: d.bodyFont }).filter(([, v]) => v !== undefined)) as Partial<Record<DesignSetting, string>>
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
      design: designNow(base),
    }
  })
}

const ID = /^[a-z][a-z0-9-]{0,39}$/
const BLOCK_TYPE = /^[A-Z][A-Za-z0-9]{0,59}$/
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
const choices = (v: unknown): { id: string; label: string }[] | null => {
  if (!Array.isArray(v) || v.length > 24) return null
  const out = v.map((o) => (o && typeof o === 'object' && ID.test(String((o as { id?: unknown }).id)) ? { id: String((o as { id: string }).id), label: text((o as { label?: unknown }).label, 60) } : null))
  return out.every(Boolean) ? (out as { id: string; label: string }[]) : null
}

/** Read a style menu that crossed the network. Shape and size only; ids are slugs, labels are short. Null when malformed. */
export function readWebsiteVeraStyleMenu(value: unknown): WebsiteVeraStyleMenu | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.dials) || v.dials.length > 30) return null
  const dials: WebsiteVeraStyleMenu['dials'] = []
  for (const d of v.dials) {
    const r = (d ?? {}) as Record<string, unknown>
    const options = choices(r.options)
    if (!ID.test(String(r.id)) || !options || !options.length) return null
    dials.push({ id: String(r.id), label: text(r.label, 60), options, current: text(r.current, 40), own: text(r.own, 40) })
  }
  const accents = choices(v.accents ?? [])
  if (!accents || !Array.isArray(v.looks ?? []) || (v.looks as unknown[] ?? []).length > 8) return null
  const looks: WebsiteVeraStyleMenu['looks'] = []
  for (const l of (v.looks ?? []) as unknown[]) {
    const r = (l ?? {}) as Record<string, unknown>
    if (!ID.test(String(r.id)) || !r.dials || typeof r.dials !== 'object' || Array.isArray(r.dials)) return null
    const known = new Map(dials.map((d) => [d.id, new Set(d.options.map((o) => o.id))]))
    looks.push({ id: String(r.id), label: text(r.label, 60), dials: Object.fromEntries(Object.entries(r.dials as Record<string, unknown>).filter(([k, x]) => typeof x === 'string' && known.get(k)?.has(x))) as Record<string, string> })
  }
  let options: WebsiteVeraBlockOption[] | undefined
  if (v.options != null) {
    if (!Array.isArray(v.options) || v.options.length > 120) return null
    options = []
    for (const o of v.options as unknown[]) {
      const r = (o ?? {}) as Record<string, unknown>
      if (!SECTION_ID.test(String(r.sectionId)) || typeof r.field !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(r.field) || !Array.isArray(r.choices) || r.choices.length < 2 || r.choices.length > 12) return null
      const picks = (r.choices as unknown[]).map((c) => (c && typeof c === 'object' && CHOICE.test(String((c as { id?: unknown }).id)) ? { id: String((c as { id: string }).id), label: text((c as { label?: unknown }).label, 60) } : null))
      if (!picks.every(Boolean)) return null
      options.push({ sectionId: String(r.sectionId), field: r.field, label: text(r.label, 60), current: text(r.current, 40), choices: picks as { id: string; label: string }[] })
    }
  }
  let sections: WebsiteVeraAddable | undefined
  if (v.sections != null) {
    if (!Array.isArray(v.sections) || v.sections.length > 80) return null
    sections = []
    for (const s of v.sections as unknown[]) {
      const r = (s ?? {}) as Record<string, unknown>
      if (!BLOCK_TYPE.test(String(r.type))) return null
      sections.push({ type: String(r.type), label: text(r.label, 60) })
    }
  }
  return { dials, accents, accent: typeof v.accent === 'string' ? v.accent.slice(0, 40) : null, looks, ...(sections ? { sections } : {}), ...(options ? { options } : {}) }
}

/** Keys a change may carry. Anything else (text, heading, props, css) is refused, not ignored. */
const ALLOWED_KEYS = new Set(['kind', 'sectionId', 'blockType', 'toPosition', 'device', 'visible', 'tone', 'width', 'dial', 'option', 'accent', 'look', 'setting', 'field', 'choice'])
const WORD_KEYS = /^(text|title|heading|headline|body|copy|label|button|caption|description|subtitle|value|content|props)$/i
const AUTHORSHIP_REFUSAL = 'Vera does not write or rewrite your words, so that line was left out. Select the text and ask for coaching questions instead.'

type ParsedVeraLayout = { changes: WebsiteVeraChange[]; refused: string[] }

/**
 * Parse an untrusted proposal (`{ changes: [...] }`) against the section ids that exist on this page. Every
 * line either becomes a typed change or a plain refusal the person can read; nothing is dropped silently.
 */
export function parseWebsiteVeraLayout(raw: unknown, sectionIds: ReadonlySet<string>, menu?: WebsiteVeraStyleMenu | null): ParsedVeraLayout {
  const out: ParsedVeraLayout = { changes: [], refused: [] }
  let added = 0
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
    if (typeof o.kind === 'string' && STYLE_KINDS.has(o.kind)) { parseStyle(o, at, menu ?? null, out); return }
    if (o.kind === 'add') {
      const addable = menu?.sections
      if (!addable) { out.refused.push(`${at} added a section, which is not open here.`); return }
      if (!addable.some((a) => a.type === o.blockType)) { out.refused.push(`${at} asked for a section the Add tab does not offer on this page.`); return }
      const to = typeof o.toPosition === 'number' && Number.isInteger(o.toPosition) ? o.toPosition : NaN
      if (!(to >= 1 && to <= sectionIds.size + added + 1)) { out.refused.push(`${at} added a section at a position the page does not have.`); return }
      added++
      out.changes.push({ kind: 'add', blockType: o.blockType as string, toPosition: to }); return
    }
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
      case 'design': {
        if (!isDesignSetting(o.setting) || !(VERA_DESIGN_SETTINGS[o.setting].choices as readonly unknown[]).includes(o.choice)) { out.refused.push(`${at} asked for a design setting the editor does not offer.`); return }
        out.changes.push({ kind: 'design', sectionId, setting: o.setting, choice: o.choice as string }); return
      }
      case 'option': {
        const offered = menu?.options?.find((x) => x.sectionId === sectionId && x.field === o.field)
        if (!offered) { out.refused.push(`${at} changed an option that section does not offer.`); return }
        if (!offered.choices.some((c) => c.id === o.choice)) { out.refused.push(`${at} asked for a ${offered.label.toLowerCase()} choice that section does not offer.`); return }
        out.changes.push({ kind: 'option', sectionId, field: offered.field, choice: o.choice as string }); return
      }
      default:
        out.refused.push(`${at} is a kind of change Vera cannot make here.`)
    }
  })
  return out
}

/** A site style line, checked against the theme's own menu. Nothing outside the menu can be stored. */
function parseStyle(o: Record<string, unknown>, at: string, menu: WebsiteVeraStyleMenu | null, out: ParsedVeraLayout) {
  if (!menu) { out.refused.push(`${at} changed your site's style, which is not open here.`); return }
  if (o.kind === 'style') {
    const dial = menu.dials.find((d) => d.id === o.dial)
    if (!dial) { out.refused.push(`${at} named a style your theme does not offer.`); return }
    if (!dial.options.some((opt) => opt.id === o.option)) { out.refused.push(`${at} asked for a ${dial.label.toLowerCase()} option your theme does not offer.`); return }
    out.changes.push({ kind: 'style', dial: dial.id, option: o.option as string }); return
  }
  if (o.kind === 'accent') {
    if (!menu.accents.some((a) => a.id === o.accent)) { out.refused.push(`${at} asked for an accent your theme does not offer.`); return }
    out.changes.push({ kind: 'accent', accent: o.accent as string }); return
  }
  if (!menu.looks.some((l) => l.id === o.look)) { out.refused.push(`${at} asked for a Look your theme does not offer.`); return }
  out.changes.push({ kind: 'look', look: o.look as string })
}

const DEVICE_WORD: Record<Device, string> = { desktop: 'on desktop', tablet: 'on tablet', phone: 'on phones' }

function sectionName(doc: Data, config: Config, id: string): string {
  const block = findBlockDeep(doc, config, id)
  return block ? String(config.components[block.type]?.label ?? block.type) : 'A section'
}

/** The line a person reads before ticking. Every kind here is undone by the editor's Undo while it is a draft. */
export function describeWebsiteVeraChange(change: WebsiteVeraChange, doc: Data, config: Config, menu?: WebsiteVeraStyleMenu | null): string {
  if (isWebsiteVeraStyleChange(change)) return describeStyle(change, menu ?? null)
  if (change.kind === 'add') return `Add a ${String(config.components[change.blockType]?.label ?? change.blockType)} section at position ${change.toPosition}, with placeholder text for your words`
  const name = sectionName(doc, config, change.sectionId)
  switch (change.kind) {
    case 'move': return `Move ${name} to position ${change.toPosition}`
    case 'visibility': return `${change.visible ? 'Show' : 'Hide'} ${name} ${DEVICE_WORD[change.device]}`
    case 'duplicate': return `Duplicate ${name} (the copy keeps your words)`
    case 'tone': return `Give ${name} the ${change.tone} background`
    case 'width': return `Set ${name} to ${change.width} width`
    case 'design': {
      const choice = change.choice === 'theme' ? "your theme's own" : change.choice
      return `Set ${name} ${VERA_DESIGN_SETTINGS[change.setting].label} to ${choice}`
    }
    case 'option': {
      const block = findBlockDeep(doc, config, change.sectionId)
      const def = block ? choiceField(config, block.type, change.field) : null
      const pick = def?.options.find((o) => String(o.value) === change.choice)
      return `Set ${name} ${(def?.label ?? change.field).toLowerCase()} to ${pick?.label ?? change.choice}`
    }
  }
}

function describeStyle(change: WebsiteVeraStyleChange, menu: WebsiteVeraStyleMenu | null): string {
  switch (change.kind) {
    case 'style': {
      const dial = menu?.dials.find((d) => d.id === change.dial)
      const option = dial?.options.find((o) => o.id === change.option)
      return `Set ${dial?.label ?? change.dial} to ${option?.label ?? change.option} across your site`
    }
    case 'accent': return `Use the ${menu?.accents.find((a) => a.id === change.accent)?.label ?? change.accent} accent across your site`
    case 'look': return `Use the ${menu?.looks.find((l) => l.id === change.look)?.label ?? change.look} Look across your site`
  }
}

/**
 * The draft `look` patch for the ticked style lines, in order, in the same shape the Style panel writes (changeDials in
 * the shell): a value equal to the theme's own is stored as `null`, and a Look clears every dial before setting its
 * own, exactly as picking that Look in the panel does. The accent is left alone by a Look, as in the panel.
 */
export function websiteVeraStylePatch(menu: WebsiteVeraStyleMenu, changes: readonly WebsiteVeraChange[]): { patch: Record<string, string | null>; drop: string[]; results: VeraLayoutResult[] } {
  const patch: Record<string, string | null> = {}
  const drop = new Set<string>()
  const results: VeraLayoutResult[] = []
  for (const change of changes) {
    if (!isWebsiteVeraStyleChange(change)) continue
    const line = describeStyle(change, menu)
    if (change.kind === 'style') {
      const dial = menu.dials.find((d) => d.id === change.dial)
      if (!dial || !dial.options.some((o) => o.id === change.option)) { results.push({ change, ok: false, line: `${line}: your theme no longer offers that` }); continue }
      patch[dial.id] = change.option === dial.own ? null : change.option
    } else if (change.kind === 'accent') {
      if (!menu.accents.some((a) => a.id === change.accent)) { results.push({ change, ok: false, line: `${line}: your theme no longer offers that` }); continue }
      patch.accent = change.accent
    } else {
      const look = menu.looks.find((l) => l.id === change.look)
      if (!look) { results.push({ change, ok: false, line: `${line}: your theme no longer offers that` }); continue }
      for (const d of menu.dials) { drop.add(d.id); delete patch[d.id] }
      for (const [id, value] of Object.entries(look.dials)) {
        const own = menu.dials.find((d) => d.id === id)?.own
        if (value !== own) patch[id] = value
      }
    }
    results.push({ change, ok: true, line })
  }
  return { patch, drop: [...drop].filter((id) => !(id in patch)), results }
}

type VeraLayoutResult = { change: WebsiteVeraChange; ok: boolean; line: string }

/** Apply the ticked SECTION changes in order to a page document (style lines are skipped: websiteVeraStylePatch
 *  handles those). Each line reports on its own; a miss never hides another. */
export function applyWebsiteVeraLayout(doc: Data, config: Config, changes: WebsiteVeraChange[]): { doc: Data; results: VeraLayoutResult[] } {
  let next = doc
  const results: VeraLayoutResult[] = []
  for (const change of changes) {
    if (isWebsiteVeraStyleChange(change)) continue
    const line = describeWebsiteVeraChange(change, next, config)
    if (change.kind === 'add') {
      // The Add tab's own insert: the block's defaults and a fresh id, refused at the block's per-page cap.
      const added = config.components[change.blockType] ? addBlock(next, config, change.blockType) : { data: next, id: '' }
      if (!added.id) { results.push({ change, ok: false, line: `${line}: the page cannot take another one` }); continue }
      next = moveBlockTo(added.data, config, added.id, { parentId: null, slotKey: null, index: Math.min(change.toPosition - 1, added.data.content.length - 1) })
      results.push({ change, ok: true, line }); continue
    }
    const index = next.content.findIndex((b) => b.props.id === change.sectionId)
    if (index < 0) { results.push({ change, ok: false, line: `${line}: that section is no longer on the page` }); continue }
    const before = next
    switch (change.kind) {
      case 'move': next = moveBlockTo(next, config, change.sectionId, { parentId: null, slotKey: null, index: Math.min(change.toPosition - 1, next.content.length - 1) }); break
      case 'visibility': next = setSectionVisibility(next, change.sectionId, change.device, change.visible); break
      case 'duplicate': next = duplicateWebsiteSection(next, config, change.sectionId).data; break
      case 'tone': next = patchSectionBase(next, change.sectionId, { tone: change.tone }); break
      case 'width': next = patchSectionBase(next, change.sectionId, { width: change.width }); break
      case 'design': next = applyDesign(next, change.sectionId, change.setting, change.choice); break
      case 'option': next = applyOption(next, config, change.sectionId, change.field, change.choice); break
    }
    const ok = next !== before || (change.kind === 'move' && index === change.toPosition - 1)
    results.push({ change, ok, line: ok ? line : `${line}: the page could not take that change` })
  }
  return { doc: next, results }
}

/** One Design tab setting on the section's base (desktop) entry, which every device reads unless it has its own. */
function applyDesign(doc: Data, id: string, setting: DesignSetting, choice: string): Data {
  if (!(VERA_DESIGN_SETTINGS[setting].choices as readonly string[]).includes(choice)) return doc
  const now = sectionDisplay(doc, id, 'desktop')
  const theme = choice === 'theme'
  const patch: SectionDisplay =
    setting === 'align' ? { align: choice as SectionDisplay['align'] }
      : setting === 'spacing' ? { padding: theme ? undefined : DESIGN_PAD[choice] }
        : setting === 'columns' ? { columns: theme ? undefined : Number(choice) }
          : setting === 'reveal' ? { animation: choice as SectionDisplay['animation'] }
            : setting === 'headingFont' ? { textFont: theme ? undefined : (choice as SectionDisplay['textFont']) }
              : { bodyFont: theme ? undefined : (choice as SectionDisplay['bodyFont']) }
  const next = { ...now, ...patch }
  return JSON.stringify(next) === JSON.stringify(now) ? doc : updateSectionDisplay(doc, id, 'desktop', next)
}

/** One of the block's own design options, re-checked against the block config here: only a choice its panel offers. */
function applyOption(doc: Data, config: Config, id: string, field: string, choice: string): Data {
  const index = doc.content.findIndex((b) => b.props.id === id)
  const block = doc.content[index]
  const pick = block ? choiceField(config, block.type, field)?.options.find((o) => String(o.value) === choice) : undefined
  if (!block || !pick || block.props[field] === pick.value) return doc
  const content = [...doc.content]
  content[index] = { ...block, props: { ...block.props, [field]: pick.value } }
  return { ...doc, content }
}

/** THE GHOST PREVIEW (LIVE-2141): the page as it would look with the ticked SECTION lines applied, for the canvas
 *  to draw read-only while the proposal is open. Nothing is committed and the draft is untouched; style lines are
 *  counted, not drawn, so the banner can say they show once applied. */
export function websiteVeraGhost(doc: Data, config: Config, changes: readonly WebsiteVeraChange[], ticked: readonly boolean[]): { doc: Data; changed: number; styleLines: number } {
  const chosen = changes.filter((_, i) => ticked[i])
  const { doc: next, results } = applyWebsiteVeraLayout(doc, config, chosen)
  return { doc: next, changed: results.filter((r) => r.ok).length, styleLines: chosen.filter(isWebsiteVeraStyleChange).length }
}
