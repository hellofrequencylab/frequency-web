import type { Config, Data } from '@/lib/page-editor/types'

// THE PUBLISH MODAL'S CHECKS (design_handoff/frequency/templates/admin/Page Editor.html: "Every image has alt
// text", "Page title and description set"). PURE reads of the draft the editor already holds: nothing is
// saved, validated or blocked here. A failed check is a warning beside Publish, never a gate.
//
// ALT TEXT. A block (or an item of a block's array field) is image-bearing when its field definitions carry
// an `alt` field, the editor's convention beside every image field. It is missing alt text when one of its
// image-like fields holds an address and the `alt` value is empty. Nested blocks (slots) are walked too.

const IMAGE_KEY = /image|img|src|photo|picture|poster|media|logo|avatar|cover/i
const ADDRESS = /^(https?:|\/|data:image)/i

type FieldMap = Record<string, { type?: string; arrayFields?: FieldMap } | undefined>
type Block = { type: string; props: Record<string, unknown> }

function isBlock(value: unknown): value is Block {
  return !!value && typeof value === 'object' && typeof (value as Block).type === 'string' && !!(value as Block).props && typeof (value as Block).props === 'object'
}

function hasImage(values: Record<string, unknown>, fields: FieldMap): boolean {
  return Object.keys(fields).some((key) => key !== 'alt' && IMAGE_KEY.test(key) && typeof values[key] === 'string' && ADDRESS.test((values[key] as string).trim()))
}

function emptyAlt(values: Record<string, unknown>): boolean {
  return typeof values.alt !== 'string' || values.alt.trim() === ''
}

/** One count per image with an address and no alt text. */
function countIn(values: Record<string, unknown>, fields: FieldMap): number {
  let missing = 0
  if (fields.alt && hasImage(values, fields) && emptyAlt(values)) missing += 1
  for (const [key, field] of Object.entries(fields)) {
    if (field?.type !== 'array' || !field.arrayFields || !Array.isArray(values[key])) continue
    for (const item of values[key] as unknown[]) {
      if (item && typeof item === 'object') missing += countIn(item as Record<string, unknown>, field.arrayFields)
    }
  }
  return missing
}

function walk(blocks: unknown[], config: Config, seen: Set<unknown>): number {
  let missing = 0
  for (const block of blocks) {
    if (!isBlock(block) || seen.has(block)) continue
    seen.add(block)
    const fields = (config.components[block.type]?.fields ?? {}) as FieldMap
    missing += countIn(block.props, fields)
    for (const value of Object.values(block.props)) {
      if (Array.isArray(value) && value.some(isBlock)) missing += walk(value, config, seen)
    }
  }
  return missing
}

/** Images in this document that carry an address but no alt text. */
export function missingAltText(doc: Data, config: Config): number {
  return walk(doc.content as unknown[], config, new Set())
}

export interface PublishCheck {
  ok: boolean
  text: string
}

/** The modal's checks over every page in the draft, in the design's words when they pass. */
export function publishChecks(pages: { label: string; doc: Data; seo: { title: string; description: string } }[], config: Config): PublishCheck[] {
  const altMissing = pages.reduce((sum, p) => sum + missingAltText(p.doc, config), 0)
  // A blank title falls back to "Page | Site" on the live page, so only a missing description is a gap.
  const noSeo = pages.filter((p) => !p.seo.description.trim()).map((p) => p.label)
  return [
    altMissing === 0
      ? { ok: true, text: 'Every image has alt text' }
      : { ok: false, text: `${altMissing} ${altMissing === 1 ? 'image needs' : 'images need'} alt text` },
    noSeo.length === 0
      ? { ok: true, text: 'Page title and description set' }
      : { ok: false, text: `Add a search description to ${noSeo.length <= 3 ? noSeo.join(', ') : `${noSeo.length} pages`}` },
  ]
}
